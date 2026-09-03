#!/usr/bin/env bash
# =============================================================================
# Kunzz Inventory System - EC2 一键部署脚本
# 用法：
#   1) 先按 docs/OPS.md 在 EC2 装好 MariaDB / Java 21 / Nginx，并用 DBeaver 迁移数据库
#   2) 修改下方「配置区」变量
#   3) 在本地（Git Bash / Linux / macOS）运行：  bash deploy-ec2.sh
#
# 功能：本地打包后端 + 构建前端/官网 → 上传 jar/data/dist → EC2 重启后端
# =============================================================================
set -e

# -----------------------------------------------------------------------------
# 配置区（务必修改）
# -----------------------------------------------------------------------------
EC2_HOST="你的EC2公网IP"          # EC2 公网 IP 或域名
EC2_USER="ubuntu"                 # EC2 登录用户（Ubuntu=ubuntu, Amazon Linux=ec2-user）
SSH_KEY="~/.ssh/your-key.pem"     # 你的 SSH 私钥路径
APP_DIR="/opt/inventory"          # EC2 上后端部署目录
WEB_ADMIN_DIR="/var/www/admin"    # EC2 上后台前端目录
WEB_SITE_DIR="/var/www/website"   # EC2 上官网目录

# 数据库（与 docs/OPS.md 一致，脚本会写入 EC2 的环境文件）
DB_URL="jdbc:mysql://127.0.0.1:3306/u690174784_kunzz?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true"
DB_USERNAME="inventory_app"
DB_PASSWORD="换成强密码"
JWT_SECRET="$(openssl rand -hex 32)"   # 自动生成强随机密钥
CORS_ALLOWED_ORIGINS="http://localhost:*,http://127.0.0.1:*,http://${EC2_HOST}"

# 邮件 SMTP（对齐旧系统 mailer_config.php，Gmail 应用密码；生产可改用企业邮箱）
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="kunzzsup@gmail.com"
SMTP_PASS="换成新的Gmail应用密码"   # ⚠ 旧密码已进 git 历史，必须先去 Google 账号撤销重生成
# 欢迎邮件里的登录按钮地址（生产 = 后台域名）
APP_BASE_URL="http://${EC2_HOST}"

# 项目根目录（脚本所在目录）
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_JAR="$ROOT/backend/target/inventory-backend-1.0.0.jar"

# -----------------------------------------------------------------------------
# 1. 本地构建
# -----------------------------------------------------------------------------
echo "==> [1/6] 本地构建后端..."
cd "$ROOT/backend"
if command -v mvn >/dev/null 2>&1; then
  MVN="mvn"
elif [ -f "$HOME/tools/apache-maven-3.9.9/bin/mvn.cmd" ]; then
  MVN="$HOME/tools/apache-maven-3.9.9/bin/mvn.cmd"
else
  echo "✖ 找不到 Maven（mvn 或 ~/tools/apache-maven-3.9.9）"; exit 1
fi
"$MVN" -q -DskipTests package

echo "==> [2/6] 构建后台前端..."
cd "$ROOT/inventory-system/frontend"
[ -d node_modules ] || npm install
npm run build

echo "==> [3/6] 构建官网..."
cd "$ROOT/website"
[ -d node_modules ] || npm install
npm run build

# -----------------------------------------------------------------------------
# 2. 上传到 EC2
# -----------------------------------------------------------------------------
echo "==> [4/6] 上传到 EC2 ($EC2_HOST)..."
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" "mkdir -p $APP_DIR $WEB_ADMIN_DIR $WEB_SITE_DIR"

scp $SSH_OPTS "$BACKEND_JAR" "$EC2_USER@$EC2_HOST:$APP_DIR/inventory-backend-1.0.0.jar"
scp -r $SSH_OPTS "$ROOT/backend/data" "$EC2_USER@$EC2_HOST:$APP_DIR/data"
# 前端 dist 先传到临时目录再复制，避免直接覆盖目录
scp -r $SSH_OPTS "$ROOT/inventory-system/frontend/dist" "$EC2_USER@$EC2_HOST:/tmp/_tmp_admin" \
  && ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" "cp -r /tmp/_tmp_admin/* $WEB_ADMIN_DIR/ && rm -rf /tmp/_tmp_admin"
scp -r $SSH_OPTS "$ROOT/website/dist" "$EC2_USER@$EC2_HOST:/tmp/_tmp_site" \
  && ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" "cp -r /tmp/_tmp_site/* $WEB_SITE_DIR/ && rm -rf /tmp/_tmp_site"

# -----------------------------------------------------------------------------
# 3. EC2 上写入环境文件并重启后端
# -----------------------------------------------------------------------------
echo "==> [5/6] 配置环境文件并重启后端..."
ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" bash -s <<EOF
set -e
# 写入环境文件
cat > $APP_DIR/inventory-backend.env <<ENV
DB_URL=$DB_URL
DB_USERNAME=$DB_USERNAME
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
APP_BASE_URL=$APP_BASE_URL
ENV
chmod 600 $APP_DIR/inventory-backend.env

# 停止旧进程（若有）
pkill -f 'inventory-backend-1.0.0.jar' 2>/dev/null || true
sleep 2

# 启动新进程
cd $APP_DIR
nohup env \$(cat inventory-backend.env) java -jar inventory-backend-1.0.0.jar > app.log 2>&1 &
echo "后端已启动，PID: \$!"
EOF

# -----------------------------------------------------------------------------
# 4. 健康检查
# -----------------------------------------------------------------------------
echo "==> [6/6] 等待后端启动并检查健康..."
for i in $(seq 1 15); do
  sleep 3
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$EC2_HOST:8081/api/auth/me" 2>/dev/null || true)
  if [ "$CODE" = "401" ] || [ "$CODE" = "200" ]; then
    echo "✔ 后端已就绪（HTTP $CODE，未登录 401 属正常）"
    break
  fi
  echo "  等待... (\$i)"
done

echo
echo "================ 部署完成 ================"
echo "后端:      http://$EC2_HOST:8081 (API)"
echo "后台管理:  http://$EC2_HOST (若已配 Nginx)"
echo "官网:      http://$EC2_HOST (若已配 Nginx)"
echo
echo "JWT_SECRET 已自动生成并写入 $APP_DIR/inventory-backend.env"
echo "（如需重启后端：ssh $EC2_USER@$EC2_HOST 'cd $APP_DIR && pkill -f inventory-backend && nohup env \$(cat inventory-backend.env) java -jar inventory-backend-1.0.0.jar > app.log 2>&1 &'）"
echo "==========================================="
