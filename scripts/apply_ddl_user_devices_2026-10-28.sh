#!/usr/bin/env bash
# =============================================================================
# 建表脚本：user_devices（「记住这台设备」，任务 2026-10-28-remember-device）
#
# 作用：把 add_new_tables_user_devices.sql 幂等地执行到目标库。
#      跑一次即可；重复跑无副作用（CREATE TABLE IF NOT EXISTS）。
#
# 用法（本地 Git Bash / Linux / macOS）：
#   # ① 远程执行（推荐，生产 VPS）—— 会自己 scp 上去再在服务器上跑
#   bash scripts/apply_ddl_user_devices_2026-10-28.sh --remote root@187.127.125.136
#
#   # ② 在服务器上直接跑（已经 ssh 上去了）
#   bash scripts/apply_ddl_user_devices_2026-10-28.sh --local
#
#   # ③ 用专门的有建表权限的账号（默认走本机 root/unix socket）
#   bash scripts/apply_ddl_user_devices_2026-10-28.sh --local --user kunzz_app --password '***'
#
#   # ④ 只看会做什么，不执行
#   bash scripts/apply_ddl_user_devices_2026-10-28.sh --remote root@x.x.x.x --dry-run
#
# 权限说明：`inventory_app`（后端应用账号）只有 SELECT/INSERT/UPDATE/DELETE，
#          建表需要 DDL 权限 —— 所以默认用本机 root（unix socket），与仓库既有做法一致
#          （见 docs/VPS_DEPLOY_2026-09-17-vps-deploy.md：`sudo mariadb < add_new_tables.sql`）。
#
# 不跑会怎样：后端会降级成原来的 24 小时 JWT（登录正常），
#            只是「重启电脑后免密进入」和「登录设备」页不生效，日志里会有 warning。
# =============================================================================
set -euo pipefail

DB_NAME_DEFAULT="u690174784_kunzz"

REMOTE=""
SQL=""
DB="$DB_NAME_DEFAULT"
DB_USER=""
DB_PASS=""
DRY_RUN=0
LOCAL=0

usage() {
  cat <<'USAGE'
建表：user_devices（「记住这台设备」，幂等）

  --remote <user@host>   远程执行（自己 scp 上去再跑；生产例：root@187.127.125.136）
  --local                在服务器本机执行（默认行为）
  --db <name>            数据库名（默认 u690174784_kunzz）
  --user/--password      用指定账号（需 CREATE 权限；默认走本机 root/unix socket）
  --sql <path>           指定 SQL 文件路径（默认仓库根的 add_new_tables_user_devices.sql）
  --dry-run              只打印将执行什么，不改库
  -h, --help             本帮助
USAGE
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --remote)   REMOTE="${2:-}"; shift 2 ;;
    --sql)      SQL="${2:-}"; shift 2 ;;
    --db)       DB="${2:-}"; shift 2 ;;
    --user)     DB_USER="${2:-}"; shift 2 ;;
    --password) DB_PASS="${2:-}"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --local)    LOCAL=1; shift ;;
    -h|--help)  usage 0 ;;
    *) echo "未知参数：$1（用 --help 看用法）" >&2; exit 1 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
[ -n "$SQL" ] || SQL="$ROOT/add_new_tables_user_devices.sql"

# ---------------------------------------------------------------------------
# 远端模式：把 SQL + 本脚本送到服务器，再在服务器上以 root 执行
# （不在 ssh 里拼内联 SQL，避免引号/转义把语句打坏）
# ---------------------------------------------------------------------------
if [ -n "$REMOTE" ] && [ "$LOCAL" -eq 0 ]; then
  [ -f "$SQL" ] || { echo "✖ 找不到 SQL 文件：$SQL" >&2; exit 1; }
  echo "==> 目标服务器：$REMOTE"
  echo "==> 上传 SQL 与执行脚本到 /tmp"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] scp \"$SQL\" $REMOTE:/tmp/kunzz_user_devices.sql"
    echo "[dry-run] scp \"${BASH_SOURCE[0]}\" $REMOTE:/tmp/kunzz_apply_ddl.sh"
    echo "[dry-run] ssh $REMOTE 'bash /tmp/kunzz_apply_ddl.sh --local --sql /tmp/kunzz_user_devices.sql --db $DB'"
    exit 0
  fi
  scp -q "$SQL" "$REMOTE:/tmp/kunzz_user_devices.sql"
  scp -q "${BASH_SOURCE[0]}" "$REMOTE:/tmp/kunzz_apply_ddl.sh"
  # 远端以 sudo 跑（建表需 DDL 权限），跑完清理临时文件
  # 远端直接用 bash 跑（以 root 登录时就是 root；非 root 账号则由脚本内部用 sudo，
  # 这种情况下需要 `ssh -t` 让 sudo 能问密码）
  ssh "$REMOTE" "bash /tmp/kunzz_apply_ddl.sh --local --sql /tmp/kunzz_user_devices.sql --db '$DB'; rc=\$?; rm -f /tmp/kunzz_user_devices.sql /tmp/kunzz_apply_ddl.sh; exit \$rc"
  exit $?
fi

# ---------------------------------------------------------------------------
# 本机执行
# ---------------------------------------------------------------------------
[ -f "$SQL" ] || { echo "✖ 找不到 SQL 文件：$SQL" >&2; exit 1; }

CLIENT="$(command -v mariadb || command -v mysql || true)"
[ -n "$CLIENT" ] || { echo "✖ 本机找不到 mariadb/mysql 客户端" >&2; exit 1; }

mysql_cmd() {
  if [ -n "$DB_USER" ]; then
    MYSQL_PWD="$DB_PASS" "$CLIENT" --protocol=TCP -h 127.0.0.1 -P 3306 -u "$DB_USER" "$@"
  elif [ "$(id -u)" -eq 0 ]; then
    "$CLIENT" "$@"
  else
    sudo "$CLIENT" "$@"
  fi
}

echo "==> 数据库：$DB"
echo "==> SQL   ：$SQL"
echo "==> 客户端：$CLIENT"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] 将执行：$CLIENT $DB < $SQL"
  sed -n '1,20p' "$SQL"
  exit 0
fi

echo "==> 执行建表（幂等）…"
mysql_cmd "$DB" < "$SQL"

echo "==> 校验"
HAS="$(mysql_cmd -N -B "$DB" -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'user_devices';" | tr -d '[:space:]')"
if [ "$HAS" != "1" ]; then
  echo "✖ 校验失败：user_devices 表不存在" >&2
  exit 1
fi

mysql_cmd -B "$DB" -e "SHOW COLUMNS FROM user_devices;" | sed 's/^/    /'
echo
echo "✅ 完成：user_devices 表已就绪（10 个字段，含 token_hash / expires_at_ms / revoked_at_ms）"
echo "   下一步：重启后端 → systemctl restart inventory-backend"
echo "   验证  ：curl -s -X POST https://www.kunzzgroup.com/api/auth/refresh -H 'Content-Type: application/json' -d '{\"deviceToken\":\"x\"}'"
echo "           期望返回 {\"code\":401,...}（接口存在、令牌无效），而不是 404/500"
