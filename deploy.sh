#!/bin/bash
#
# Deploy AI Text Humanizer to HestiaCP
#
# Usage (as root):
#   cd /home/rindra/web/generator.rindra.org/public_html
#   git clone <repo-url> .
#   bash deploy.sh
#

set -e

HESTIA_USER="rindra"
DOMAIN="generator.rindra.org"
APP_PORT=3000
PM2_APP_NAME="ai-humanizer"
APP_DIR="/home/${HESTIA_USER}/web/${DOMAIN}/public_html"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

[ "$EUID" -ne 0 ] && fail "Run as root: sudo bash deploy.sh"

echo ""
echo "========================================="
echo "  Deploying to ${DOMAIN}"
echo "========================================="
echo ""

# ── 1. Dependencies ───────────────────────────────────────
info "Installing npm dependencies..."
cd "$APP_DIR"
npm ci --production 2>/dev/null || npm install --production
ok "Done"

# ── 2. .env ───────────────────────────────────────────────
if [ ! -f "${APP_DIR}/.env" ]; then
    info "Creating .env..."
    read -rp "  OpenAI API Key: " OPENAI_KEY
    read -rp "  Admin username [admin]: " ADMIN_USER; ADMIN_USER=${ADMIN_USER:-admin}
    read -rsp "  Admin password: " ADMIN_PASS; echo ""
    cat > "${APP_DIR}/.env" <<EOF
NODE_ENV=production
PORT=${APP_PORT}
OPENAI_API_KEY=${OPENAI_KEY}
AUTH_USERNAME=${ADMIN_USER}
AUTH_PASSWORD=${ADMIN_PASS}
ALLOWED_ORIGINS=https://${DOMAIN}
EOF
    chmod 600 "${APP_DIR}/.env"
    ok ".env created"
else
    ok ".env exists"
fi

# ── 3. Ownership ──────────────────────────────────────────
chown -R "${HESTIA_USER}:${HESTIA_USER}" "$APP_DIR"

# ── 4. Nginx proxy template ──────────────────────────────
# Without this, HestiaCP serves static files instead of proxying to Node
info "Installing nginx proxy template..."

PROXY_SYSTEM=$(grep -oP "^PROXY_SYSTEM='\K[^']*" /usr/local/hestia/conf/hestia.conf 2>/dev/null || echo "")
WEB_SYSTEM=$(grep -oP "^WEB_SYSTEM='\K[^']*" /usr/local/hestia/conf/hestia.conf 2>/dev/null || echo "")

if [ "$PROXY_SYSTEM" = "nginx" ]; then
    TPL_DIR="/usr/local/hestia/data/templates/web/nginx"
    TPL_CMD="v-change-web-domain-proxy-tpl"
    LISTEN="%proxy_port%"; LISTEN_SSL="%proxy_ssl_port%"
else
    TPL_DIR="/usr/local/hestia/data/templates/web/nginx/php-fpm"
    TPL_CMD="v-change-web-domain-tpl"
    LISTEN="%web_port%"; LISTEN_SSL="%web_ssl_port%"
fi

# HTTP
cat > "${TPL_DIR}/nodeapp.tpl" <<EOF
server {
    listen      %ip%:${LISTEN};
    server_name %domain_idn% %alias_idn%;
    include %home%/conf/web/%domain%/nginx.forcessl.conf*;

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering    off;
    }

    location /error/ { alias %home%/web/%domain%/document_errors/; }
    location ~ /\.(?!well-known\/) { deny all; return 404; }
    include %home%/conf/web/%domain%/nginx.conf_*;
}
EOF

# HTTPS
cat > "${TPL_DIR}/nodeapp.stpl" <<EOF
server {
    listen      %ip%:${LISTEN_SSL} ssl;
    server_name %domain_idn% %alias_idn%;
    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering    off;
    }

    location /error/ { alias %home%/web/%domain%/document_errors/; }
    location ~ /\.(?!well-known\/) { deny all; return 404; }
    include %home%/conf/web/%domain%/nginx.ssl.conf_*;
}
EOF

# Create domain if needed, then apply template
/usr/local/hestia/bin/v-list-web-domain "$HESTIA_USER" "$DOMAIN" &>/dev/null || \
    /usr/local/hestia/bin/v-add-web-domain "$HESTIA_USER" "$DOMAIN"
/usr/local/hestia/bin/${TPL_CMD} "$HESTIA_USER" "$DOMAIN" "nodeapp"
/usr/local/hestia/bin/v-rebuild-web-domain "$HESTIA_USER" "$DOMAIN"
systemctl restart nginx
ok "Nginx configured"

# ── 5. SSL ────────────────────────────────────────────────
if [ ! -f "/home/${HESTIA_USER}/conf/web/${DOMAIN}/ssl/${DOMAIN}.pem" ]; then
    info "Requesting SSL certificate..."
    /usr/local/hestia/bin/v-add-letsencrypt-domain "$HESTIA_USER" "$DOMAIN" "" "yes" 2>/dev/null && \
        ok "SSL issued" || warn "SSL failed — set DNS A record first, then run:\n  /usr/local/hestia/bin/v-add-letsencrypt-domain ${HESTIA_USER} ${DOMAIN}"
else
    ok "SSL exists"
fi

# ── 6. PM2 ────────────────────────────────────────────────
info "Starting PM2..."

# Resolve full path to pm2 and node (may be under nvm)
PM2_BIN=$(which pm2)
NODE_BIN=$(which node)
NODE_DIR=$(dirname "$NODE_BIN")

su -s /bin/bash "$HESTIA_USER" -c "export PATH=${NODE_DIR}:\$PATH; pm2 delete ${PM2_APP_NAME} 2>/dev/null || true"
su -s /bin/bash "$HESTIA_USER" -c "export PATH=${NODE_DIR}:\$PATH; cd ${APP_DIR} && PORT=${APP_PORT} NODE_ENV=production pm2 start src/server.js --name ${PM2_APP_NAME}"
su -s /bin/bash "$HESTIA_USER" -c "export PATH=${NODE_DIR}:\$PATH; pm2 save"

# PM2 startup: auto-restart on reboot
"$PM2_BIN" startup systemd -u "$HESTIA_USER" --hp "/home/${HESTIA_USER}" 2>/dev/null || true
ok "App running"

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Live at: https://${DOMAIN}${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "  PM2 commands (as root):"
echo "    su -s /bin/bash ${HESTIA_USER} -c 'export PATH=${NODE_DIR}:\$PATH; pm2 logs ${PM2_APP_NAME}'"
echo "    su -s /bin/bash ${HESTIA_USER} -c 'export PATH=${NODE_DIR}:\$PATH; pm2 restart ${PM2_APP_NAME}'"
echo ""
