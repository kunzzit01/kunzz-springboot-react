#!/usr/bin/env node
/**
 * =============================================================================
 * sync-live-stock.cjs — 从 live（kunzzgroup.com）同步进出货数据到本地数据库
 * =============================================================================
 * 解决的问题：
 *   「分发静态 dump」的机制缺陷——dump 导出后 live 的任何新增/修改都会漏。
 *   本脚本直接从 live 的进出货 API 拉取数据，对比本地，以 live 为准补齐差异。
 *
 * 用法（在 inventory-system/frontend 目录下运行）：
 *   node sync-live-stock.cjs                 # 默认：最近 30 天，只报告不写库
 *   node sync-live-stock.cjs --days=7        # 最近 7 天
 *   node sync-live-stock.cjs --full          # 全量（2025-01-01 至今）
 *   node sync-live-stock.cjs --apply         # 报告 + 自动写库（以 live 为准）
 *   node sync-live-stock.cjs --days=7 --apply
 *
 * 依赖：
 *   - puppeteer-core（本目录 node_modules 已有）+ 本机 Chrome
 *   - 本机 XAMPP MySQL（root 无密码）或通过 MYSQL_CMD 环境变量指定
 *   - 凭证文件 live-credentials.json（已被 .gitignore 排除，不会进 git）
 * =============================================================================
 */
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------- 参数 ----------
const args = process.argv.slice(2);
const getArg = (k, d) => {
  const a = args.find(x => x.startsWith(k + '='));
  return a ? a.split('=')[1] : d;
};
const DAYS = parseInt(getArg('--days', '30'), 10);
const FULL = args.includes('--full');
const APPLY = args.includes('--apply');

// ---------- 配置 ----------
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-credentials.json'), 'utf8'));
const MYSQL = process.env.MYSQL_CMD || 'C:/xampp/mysql/bin/mysql.exe';
const DB = process.env.DB_NAME || 'u690174784_kunzz';
const SYSTEMS = [
  { rest: 'J1', api: 'j1stockeditpageapi.php', table: 'j1stockedit_data' },
  { rest: 'J2', api: 'j2stockeditpageapi.php', table: 'j2stockedit_data' },
  { rest: 'J3', api: 'j3stockeditpageapi.php', table: 'j3stockedit_data' },
];

// HTML 实体解码（product_name 清洗用：A&amp;W → A&W）
function unescapeHtml(s) {
  if (s == null) return s;
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

// ---------- MySQL 工具 ----------
function mysql(argsArr, stdin) {
  const full = [MYSQL, '-u', 'root', '--batch', ...argsArr];
  const out = execFileSync(full[0], full.slice(1), {
    input: stdin || '',
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out;
}

function mysqlQuery(sql) {
  return mysql(['-N', '-e', sql], '').trim();
}

// 读本地表：返回 Map<id, record>（按日期范围过滤；--batch 下字段内 TAB 转义为 \t，NULL 为 'NULL'）
function readLocal(table, sDate, eDate) {
  const cols = 'id, date, time, product_name, receiver, created_at, updated_at, in_quantity, out_quantity, specification, price, code_number, remark, target_system, type, mobile_ref_id, deleted_at, deleted_by, created_by, main_record_id';
  const out = mysql(['-N', '-e',
    `SELECT ${cols} FROM \`${DB}\`.${table} WHERE date BETWEEN '${sDate}' AND '${eDate}'`], '');
  const map = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const p = line.split('\t');
    if (p.length < 20) continue;
    map.set(Number(p[0]), p);
  }
  return map;
}

// ---------- 登录 live ----------
async function login(page) {
  await page.goto(CFG.loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('form input[name=username]', { timeout: 20000 });
  await page.type('input[name=username]', CFG.user);
  await page.type('input[name=password]', CFG.pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.click('form button[type=submit], form input[type=submit], form button', { timeout: 10000 }).catch(() => {}),
  ]);
  await new Promise(r => setTimeout(r, 3000));
  const ok = page.url().includes('/backend/');
  if (!ok) throw new Error('live 登录失败，请检查 live-credentials.json');
  console.log('  [OK] live 登录成功');
}

// 拉 live 数据（按日期范围）
async function fetchLive(page, api, startDate, endDate) {
  const r = await page.evaluate(async (u) => {
    const resp = await fetch(u, { credentials: 'include' });
    const j = await resp.json();
    return j;
  }, `${CFG.baseUrl}/backend/${api}?action=list&start_date=${startDate}&end_date=${endDate}`);
  const recs = (r.data && r.data.records) || [];
  return recs;
}

// ---------- 主流程 ----------
(async () => {
  console.log('====================================================');
  console.log('  live 进出货同步工具');
  console.log(`  范围: ${FULL ? '全量(2025-01-01起)' : '最近 ' + DAYS + ' 天'} | 模式: ${APPLY ? '写库(以live为准)' : '仅报告'}`);
  console.log('====================================================');

  const endDate = new Date();
  const startDate = new Date();
  if (FULL) startDate.setFullYear(2025, 0, 1);
  else startDate.setDate(startDate.getDate() - DAYS);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sDate = fmt(startDate), eDate = fmt(endDate);
  console.log(`  日期范围: ${sDate} ~ ${eDate}\n`);

  // 1. 登录
  const browser = await puppeteer.launch({
    executablePath: CFG.chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  try {
    await login(page);

    let totalInsert = 0, totalUpdate = 0;
    const reports = [];

    for (const sys of SYSTEMS) {
      console.log(`--- ${sys.rest} (${sys.table}) ---`);
      // 拉 live
      const live = await fetchLive(page, sys.api, sDate, eDate);
      console.log(`  live 记录: ${live.length}`);

      // 读本地（只读范围内 id 的记录——全表读可能大，按 id 范围读优化：
      // 简单起见读全表对应店的表）
      const local = readLocal(sys.table, sDate, eDate);
      console.log(`  本地记录(范围内): ${local.size}`);

      // 对比
      const inserts = [];   // live 有本地无
      const updates = [];   // 两边都有但内容不同（以 live 为准）
      const deletedLocally = []; // 本地有 live 无（不自动删，仅报告）

      for (const lv of live) {
        const id = Number(lv.id);
        const lp = local.get(id);
        const liveDeleted = lv.deleted_at ? 1 : 0;
        if (!lp) {
          inserts.push(lv);
          continue;
        }
        // 内容对比（关键字段；--batch 下 NULL 为字面 'NULL'，产品名 TAB 忽略）
        const localDeleted = (lp[16] && lp[16] !== 'NULL') ? 1 : 0;
        const norm = v => (v == null || v === 'NULL' ? '' : String(v).replace(/\t/g, '').replace(/\\t/g, '').trim());
        const same =
          lp[1] === lv.date && norm(lp[3]) === norm(unescapeHtml(lv.product_name)) &&
          Math.abs(Number(lp[7] || 0) - Number(lv.in_quantity)) < 0.01 &&
          Math.abs(Number(lp[8] || 0) - Number(lv.out_quantity)) < 0.01 &&
          norm(lp[12]) === norm(lv.remark) && localDeleted === liveDeleted;
        if (!same) updates.push(lv);
      }
      // 本地有 live 无（仅报告；live 未返回 = 可能是本地新增或删除状态差异）
      const liveIds = new Set(live.map(r => Number(r.id)));
      for (const [id, lp] of local) {
        const localDeleted = (lp[16] && lp[16] !== 'NULL') ? 1 : 0;
        if (!liveIds.has(id) && !localDeleted) {
          deletedLocally.push({ id, date: lp[1], name: lp[3], del: lp[16] });
        }
      }

      console.log(`  → 需要新增: ${inserts.length} | 需要更新: ${updates.length} | 本地有live无(未删): ${deletedLocally.length}`);

      if (APPLY && (inserts.length || updates.length)) {
        // 写库前自动备份（防误操作）
        const bakFile = path.join(__dirname, `sync_backup_${Date.now()}.sql`);
        try {
          const dumpOut = execFileSync(process.env.MYSQLDUMP_CMD || 'C:/xampp/mysql/bin/mysqldump.exe', ['-u', 'root', '--default-character-set=utf8mb4', DB], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
          fs.writeFileSync(bakFile, dumpOut, 'utf8');
          console.log(`  📦 已备份当前库到 ${path.basename(bakFile)}`);
        } catch (e) {
          console.warn(`  ⚠️ 备份失败（继续）: ${String(e).slice(0, 120)}`);
        }
        const sqlParts = [];
        const cols = '(id, date, time, product_name, receiver, created_at, updated_at, in_quantity, out_quantity, ' +
          'specification, price, code_number, remark, target_system, type, mobile_ref_id, deleted_at, deleted_by, created_by, main_record_id)';
        const q = v => (v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");
        const qn = v => q(unescapeHtml(v));
        const n = v => (v == null ? 'NULL' : String(v));

        if (inserts.length) {
          const vals = inserts.map(r =>
            `(${r.id},'${r.date}','${r.time}',${qn(r.product_name)},${qn(r.receiver)},${qn(r.created_at)},${qn(r.updated_at)},${r.in_quantity},${r.out_quantity},${qn(r.specification)},${r.price},${qn(r.code_number)},${qn(r.remark)},${qn(r.target_system)},${qn(r.type)},${n(r.mobile_ref_id)},${n(r.deleted_at)},${n(r.deleted_by)},${qn(r.created_by)},${n(r.main_record_id)})`
          ).join(',\n');
          sqlParts.push(`INSERT INTO \`${DB}\`.${sys.table} ${cols} VALUES\n${vals}\nON DUPLICATE KEY UPDATE date=VALUES(date), product_name=VALUES(product_name), in_quantity=VALUES(in_quantity), out_quantity=VALUES(out_quantity), deleted_at=VALUES(deleted_at);\n`);
        }
        if (updates.length) {
          for (const r of updates) {
            sqlParts.push(`UPDATE \`${DB}\`.${sys.table} SET date='${r.date}', time='${r.time}', product_name=${qn(r.product_name)}, receiver=${qn(r.receiver)}, created_at=${qn(r.created_at)}, updated_at=${qn(r.updated_at)}, in_quantity=${r.in_quantity}, out_quantity=${r.out_quantity}, specification=${qn(r.specification)}, price=${r.price}, code_number=${qn(r.code_number)}, remark=${qn(r.remark)}, target_system=${qn(r.target_system)}, type=${qn(r.type)}, mobile_ref_id=${n(r.mobile_ref_id)}, deleted_at=${n(r.deleted_at)}, deleted_by=${n(r.deleted_by)}, created_by=${qn(r.created_by)}, main_record_id=${n(r.main_record_id)} WHERE id=${r.id};\n`);
          }
        }
        const sqlFile = path.join(__dirname, `sync_live_${sys.rest}_${Date.now()}.sql`);
        fs.writeFileSync(sqlFile, sqlParts.join(''), 'utf8');
        try {
          mysql(['--default-character-set=utf8mb4', DB], sqlParts.join(''));
          console.log(`  ✅ 已写库 ${inserts.length} 新增 + ${updates.length} 更新`);
          totalInsert += inserts.length;
          totalUpdate += updates.length;
          fs.unlinkSync(sqlFile);
        } catch (e) {
          console.error(`  ❌ 写库失败（SQL 已保留在 ${sqlFile}）: ${String(e).slice(0, 200)}`);
        }
      } else {
        // 报告明细
        if (inserts.length) {
          console.log('  新增明细:');
          inserts.slice(0, 10).forEach(r => console.log(`    ${r.date} ${unescapeHtml(r.product_name)} in=${r.in_quantity} out=${r.out_quantity} ${r.receiver || ''}`));
          if (inserts.length > 10) console.log(`    ... 还有 ${inserts.length - 10} 条`);
        }
        if (updates.length) {
          console.log('  更新明细:');
          updates.slice(0, 10).forEach(r => console.log(`    id=${r.id} ${r.date} ${unescapeHtml(r.product_name)} in=${r.in_quantity} out=${r.out_quantity}`));
          if (updates.length > 10) console.log(`    ... 还有 ${updates.length - 10} 条`);
        }
        if (deletedLocally.length) {
          console.log('  本地有live无（未删除，需人工确认）:');
          deletedLocally.slice(0, 10).forEach(r => console.log(`    id=${r.id} ${r.date} ${r.name} del=${r.del}`));
          if (deletedLocally.length > 10) console.log(`    ... 还有 ${deletedLocally.length - 10} 条`);
        }
      }
      reports.push({ sys: sys.rest, insert: inserts.length, update: updates.length, onlyLocal: deletedLocally.length });
    }

    console.log('\n================ 汇总 ================');
    if (APPLY) {
      reports.forEach(r => console.log(`  ${r.sys}: 新增 ${r.insert}，更新 ${r.update}`));
      console.log(`  ✅ 共新增 ${totalInsert}，更新 ${totalUpdate}`);
    } else {
      reports.forEach(r => console.log(`  ${r.sys}: 待新增 ${r.insert}，待更新 ${r.update}，本地独有 ${r.onlyLocal}`));
      console.log('\n  提示: 加 --apply 参数即可自动写库（以 live 为准）。');
    }
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error('脚本失败:', e.message);
  process.exit(1);
});
