#!/usr/bin/env bash
# =============================================================================
# Kunzz Inventory System - EC2 Nginx 反代配置脚本
# 用法：先跑 deploy-ec2.sh 部署完成后，再运行本脚本启用 Nginx
#   bash nginx-ec2.sh
#
# 说明：
#   - 有域名：把 DOMAIN 设为你的域名（admin.xxx.com 和 www.xxx.com 指向 EC2）
#   - 无域名：DOMAIN 留空，用 EC2 IP + default_server 直接访问
# =============================================================================
set -e

# -----------------------------------------------------------------------------
# 配置区（务必修改）
# -----------------------------------------------------------------------------
EC2_HOST="你的EC2公网IP"
EC2_USER="ubuntu"
SSH_KEY="~/.ssh/your-key.pem"
DOMAIN=""                     # 有域名填如 "example.com"；无域名留空用 IP

BACKEND_PORT="8081"           # Spring Boot 端口
WEB_ADMIN_DIR="/var/www/admin"    # 后台前端 dist
WEB_SITE_DIR="/var/www/website"   # 官网 dist
UPLOAD_MAX="30m"              # 上传大小限制（视频）

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

# 生成 server_name
if [ -n "$DOMAIN" ]; then
  ADMIN_SERVER_NAME="admin.$DOMAIN"
  SITE_SERVER_NAME="www.$DOMAIN $DOMAIN"
  SITE_NAME="inventory-admin"
  SITE_NAME2="inventory-website"
else
  ADMIN_SERVER_NAME="_"   # default_server（IP 访问）
  SITE_SERVER_NAME="_"
  SITE_NAME="inventory-admin"
  SITE_NAME2="inventory-website"
fi

echo "==> 生成 Nginx 配置并上传到 EC2 ($EC2_HOST)..."

# -----------------------------------------------------------------------------
# 后台（admin）配置
# -----------------------------------------------------------------------------
cat > /tmp/inventory-admin.conf <<EOF
server {
    listen 80;
    server_name ${ADMIN_SERVER_NAME};

    root ${WEB_ADMIN_DIR};
    index index.html;

    # SPA 路由
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API → 后端
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size ${UPLOAD_MAX};
    }

    # 媒体文件（背景音乐 / 页面图片 / 视频）
    location /media/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
    }
    location /invoice/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
    }
}
EOF

# -----------------------------------------------------------------------------
# 官网配置
# -----------------------------------------------------------------------------
cat > /tmp/inventory-website.conf <<EOF
server {
    listen 80;
    server_name ${SITE_SERVER_NAME};

    root ${WEB_SITE_DIR};
    index index.html;

    location / { try_files \$uri \$uri/ /index.html; }

    # 官网媒体与 API → 后端
    location /media/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
        client_max_body_size ${UPLOAD_MAX};
    }
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
    }
}
EOF

# -----------------------------------------------------------------------------
# 上传 + 启用 + 测试
# -----------------------------------------------------------------------------
scp $SSH_OPTS /tmp/inventory-admin.conf /tmp/inventory-website.conf "$EC2_USER@$EC2_HOST:/tmp/"

ssh $SSH_OPTS "$EC2_USER@$EC2_HOST" bash -s <<EOF
set -e
# 移除旧的默认站（避免冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 安装配置
sudo cp /tmp/inventory-admin.conf /etc/nginx/sites-available/${SITE_NAME}
sudo cp /tmp/inventory-website.conf /etc/nginx/sites-available/${SITE_NAME2}
sudo ln -sf /etc/nginx/sites-available/${SITE_NAME}  /etc/nginx/sites-enabled/${SITE_NAME}
sudo ln -sf /etc/nginx/sites-available/${SITE_NAME2} /etc/nginx/sites-enabled/${SITE_NAME2}

# 目录权限（Nginx 用户可读前端产物）
sudo chown -R www-data:www-data ${WEB_ADMIN_DIR} ${WEB_SITE_DIR} 2>/dev/null || true

# 测试并重载
sudo nginx -t
sudo systemctl reload nginx
echo "Nginx 已重载"
EOF

rm -f /tmp/inventory-admin.conf /tmp/inventory-website.conf

echo
echo "================ Nginx 配置完成 ================"
if [ -n "$DOMAIN" ]; then
  echo "后台: http://admin.$DOMAIN"
  echo "官网: http://www.$DOMAIN"
  echo "（把 DNS A 记录指向 $EC2_HOST 后生效）"
else
  echo "后台: http://$EC2_HOST"
  echo "官网: http://$EC2_HOST"
  echo "（无域名，后台和官网都用 IP 访问；CORS 需含 http://$EC2_HOST）"
fi
echo "如需 HTTPS，用 certbot："
echo "  ssh $EC2_USER@$EC2_HOST 'sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d admin.$DOMAIN -d www.$DOMAIN'"
echo "================================================="
