#!/usr/bin/env bash
# ============================================================
#  Kunzz VPS 更新（本地 → VPS）
#
#  做什么（对齐 docs/VPS_DEPLOY_2026-09-17-vps-deploy.md 第 1 节「日常更新」）：
#    ① 备份：当前 jar + 后端环境变量 + 数据库 dump（存 /opt/backups/）
#    ② git pull --ff-only。工作区只有「本机构建产物」变脏时自动恢复仓库版；
#       有源码类改动 → 停下不动（说明有人在这台机器上改过代码）
#    ③ 按本次拉到的改动决定重建什么：
#         backend/**              → mvn 重编后端 + 换 /opt/inventory/app.jar
#         inventory-system/frontend/** → npm ci + build + rsync /var/www/admin
#         website/**              → npm ci + build + rsync /var/www/website
#    ④ 重启 systemd 服务 + 验证（服务状态、8080/8081 探活、登录限速自检）
#
#  会提示输入一次 root 密码（跟平时 ssh 登录一样）。
#  ⚠️ 不碰 Traefik，不重启 nginx / mysql，不改 /opt 之外的配置。
#  后端重编约 1~3 分钟，请不要关窗口。
# ============================================================
set -euo pipefail

HOST="root@187.127.125.136"
APP_DIR="/opt/kunzz-springboot-react"
JAR="/opt/inventory/app.jar"
SVC="inventory-backend"
PROBE_IP="203.0.113.250"   # TEST-NET-3 保留地址：限速自检专用，不会占用任何真实用户的桶

echo ""
echo "=============================================="
echo "  Kunzz VPS 更新"
echo "  目标：$HOST"
echo "=============================================="
echo ""

ssh "$HOST" "APP_DIR='$APP_DIR' JAR='$JAR' SVC='$SVC' PROBE_IP='$PROBE_IP' bash -s" <<'REMOTE'
set -euo pipefail
STAMP=$(date +%F_%H%M)

echo "===== 0. 前置检查 ====="
# ssh 非交互会话的 PATH 与交互登录不同：mvn 可能不在 PATH 上，这里在常见位置再找一遍
MVN=$(command -v mvn || true)
if [ -z "$MVN" ]; then
  for c in /usr/bin/mvn /usr/local/bin/mvn /usr/share/maven/bin/mvn /opt/maven/bin/mvn \
           /opt/apache-maven-*/bin/mvn /opt/*/apache-maven-*/bin/mvn /root/tools/apache-maven-*/bin/mvn \
           /usr/local/apache-maven-*/bin/mvn; do
    if [ -x "$c" ]; then MVN="$c"; break; fi
  done
fi
if [ -z "$MVN" ]; then echo "❌ 找不到 mvn（Maven），先在 VPS 上装好 Maven 再更新"; exit 1; fi
command -v git >/dev/null 2>&1 || { echo "❌ 找不到 git"; exit 1; }
if [ ! -d "$APP_DIR/.git" ]; then echo "❌ $APP_DIR 不是 git 仓库"; exit 1; fi
echo "OK：Maven=$MVN，git / $APP_DIR 就位"

cd "$APP_DIR"

echo
echo "===== 1.1 备份（jar / 环境变量 / 数据库）====="
mkdir -p /opt/backups
if [ -f "$JAR" ]; then cp -a "$JAR" "$JAR.bak"; fi
if [ -f /etc/inventory-backend.env ]; then cp -a /etc/inventory-backend.env /etc/inventory-backend.env.bak; fi
mysqldump --single-transaction u690174784_kunzz | gzip > "/opt/backups/pre_update_${STAMP}.sql.gz"
ls -lh /opt/backups/ | tail -3
echo "旧版 jar → $JAR.bak（回滚用）"

echo
echo "===== 1.2 拉取代码 ====="
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  bad=$(git status --porcelain | awk '{print $2}' | grep -vE '^(backend/target/inventory-backend-1\.0\.0\.jar|backend/static/)' || true)
  if [ -n "$bad" ]; then
    echo "❌ 工作区有非构建产物的改动，按手册要求停下不动："
    echo "$bad"
    exit 1
  fi
  echo "→ 只有本机构建产物变脏（仓库跟踪了这些产物），先恢复仓库版再拉取"
  for p in $(git status --porcelain | awk '{print $2}'); do git checkout -- "$p"; done
fi
BEFORE=$(git rev-parse HEAD)
git pull --ff-only
AFTER=$(git rev-parse HEAD)
echo "→ 版本：$(echo "$BEFORE" | cut -c1-7) → $(echo "$AFTER" | cut -c1-7)"
CHANGED=$(git diff --name-only "$BEFORE..$AFTER" || true)
if [ -z "$CHANGED" ]; then
  echo "（本次没有新提交，代码已是最新）"
else
  echo "→ 本次改动文件："
  echo "$CHANGED"
fi

echo
echo "===== 1.3 重建（按改动内容决定）====="
NEED_RESTART=0
if echo "$CHANGED" | grep -qE '^backend/'; then
  echo "→ backend/** 有改动：重编后端（$MVN -DskipTests clean package）"
  ( cd backend && "$MVN" -DskipTests clean package )
  cp -a backend/target/inventory-backend-1.0.0.jar "$JAR"
  chown kunzz:kunzz "$JAR" 2>/dev/null || true
  NEED_RESTART=1
else
  echo "→ backend/** 无改动：跳过后端重编"
fi

if echo "$CHANGED" | grep -qE '^inventory-system/frontend/'; then
  echo "→ 后台前端有改动：npm ci + build + 同步 /var/www/admin"
  ( cd inventory-system/frontend && npm ci && npm run build )
  rsync -a --delete inventory-system/frontend/dist/ /var/www/admin/
  chown -R www-data:www-data /var/www/admin
fi

if echo "$CHANGED" | grep -qE '^website/'; then
  echo "→ 官网有改动：npm ci + build + 同步 /var/www/website"
  ( cd website && npm ci && npm run build )
  rsync -a --delete website/dist/ /var/www/website/
  chown -R www-data:www-data /var/www/website
fi

echo
echo "===== 1.4 重启 + 验证 ====="
if [ "$NEED_RESTART" = 1 ]; then systemctl restart "$SVC"; sleep 10; fi
echo "服务状态：$(systemctl is-active "$SVC")"
# 后端端口不写死：按 systemd 主进程实际监听的端口探测（11-16 加固后后端在 127.0.0.1:8082，
# 8081 是别的程序且已关闭——写死 8081 会让直连永远 000、限速自检连不上并因 set -e 中断整个脚本）
API_PID=$(systemctl show -p MainPID --value "$SVC" 2>/dev/null || echo 0)
API_PORT=$(ss -ltnpH 2>/dev/null | grep "pid=$API_PID," | grep -oE '127\.0\.0\.1:[0-9]+' | head -1 | cut -d: -f2 || true)
API_PORT=${API_PORT:-8082}
printf "API 直连 %-8s: %s （期望 401）\n" "$API_PORT" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/auth/me" || true)"
printf "API 经 nginx 8080: %s （期望 401）\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/auth/me)"
printf "后台首页 8080    : %s （期望 302，未登录跳登录页）\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/)"
printf "官网 8080/home/  : %s （期望 200）\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/home/)"

echo
echo "→ 登录限速自检（用保留测试 IP $PROBE_IP，不占用任何真实用户的桶）"
for i in 1 2 3 4 5 6; do
  # 末尾 || true：探测失败只提示，不让 set -e/pipefail 把后面的日志与「完成」一起吞掉
  code=$(curl -s -H 'Content-Type: application/json' -H "X-Real-IP: $PROBE_IP" \
    -d '{"username":"__ratelimit_probe__","password":"x"}' \
    "http://127.0.0.1:$API_PORT/api/auth/login" | grep -o '"code":[0-9]*' | head -1 | cut -d: -f2 || true)
  echo "   第 $i 次 → code=${code:-（连不上 127.0.0.1:$API_PORT）}"
done
echo "   （期望：前 5 次 401，第 6 次 429）"

echo
echo "→ 后端日志尾部："
journalctl -u "$SVC" -n 12 --no-pager || true

echo
echo "===== 完成 ====="
echo "当前版本：$(git log --oneline -1)"
echo "回滚（如需）：cp -a $JAR.bak $JAR && cp -a /etc/inventory-backend.env.bak /etc/inventory-backend.env && systemctl restart $SVC"
REMOTE

echo ""
echo "=============================================="
echo "  完成。若上面出现 ❌ 或非期望的状态码，把整段输出发给管理员。"
echo "=============================================="
echo ""
read -rp "按回车关闭…" _ || true
