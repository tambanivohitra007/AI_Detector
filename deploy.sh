#!/bin/bash
#
# Deploy AI Text Humanizer to HestiaCP VPS
#
# Usage:
#   1. SSH into your VPS as root
#   2. Create the domain in HestiaCP panel first (e.g. generator.rindra.org)
#   3. Clone the repo into the domain's private/ directory:
#        cd /home/rindra/web/generator.rindra.org/private
#        git clone <repo-url> ai-humanizer
#   4. Run the script:
#        bash /home/rindra/web/generator.rindra.org/private/ai-humanizer/deploy.sh
#
# HestiaCP directory structure used:
#   /home/<user>/web/<domain>/
#     ├── private/ai-humanizer/   ← App lives here (not web-accessible)
#     ├── public_html/            ← Unused (nginx proxies to Node)
#     ├── document_errors/
#     ├── logs/
#     └── ...
#

set -e

# ── Configuration ──────────────────────────────────────────
HESTIA_USER="rindra"
DOMAIN="generator.rindra.org"
APP_PORT=3000
NODE_VERSION=20
PM2_APP_NAME="ai-humanizer"

HOME_DIR="/home/${HESTIA_USER}"
DOMAIN_DIR="${HOME_DIR}/web/${DOMAIN}"
APP_DIR="${DOMAIN_DIR}/private/ai-humanizer"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Colors ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ── Pre-checks ─────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    fail "Please run as root:  sudo bash deploy.sh"
fi

if [ ! -d "/usr/local/hestia" ]; then
    fail "HestiaCP not found. Is this the right server?"
fi

if ! id "$HESTIA_USER" &>/dev/null; then
    fail "User '${HESTIA_USER}' does not exist."
fi

# Create domain in HestiaCP if it doesn't exist yet
if ! /usr/local/hestia/bin/v-list-web-domain "$HESTIA_USER" "$DOMAIN" &>/dev/null; then
    info "Domain '${DOMAIN}' not found in HestiaCP — creating it now..."
    /usr/local/hestia/bin/v-add-web-domain "$HESTIA_USER" "$DOMAIN"
    ok "Domain created in HestiaCP"
fi

if [ ! -d "$DOMAIN_DIR" ]; then
    fail "Domain directory not found: ${DOMAIN_DIR}\nSomething went wrong creating the domain."
fi

echo ""
echo "=================================================="
echo "  AI Text Humanizer — HestiaCP Deploy"
echo "  Domain:  ${DOMAIN}"
echo "  User:    ${HESTIA_USER}"
echo "  App dir: ${APP_DIR}"
echo "  Port:    ${APP_PORT}"
echo "=================================================="
echo ""

# ── Step 1: Install Node.js ───────────────────────────────
info "Checking Node.js..."
if command -v node &>/dev/null; then
    NODE_CURRENT=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_CURRENT" -ge "$NODE_VERSION" ]; then
        ok "Node.js $(node -v) already installed"
    else
        warn "Node.js $(node -v) is old. Installing v${NODE_VERSION}..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
        ok "Node.js $(node -v) installed"
    fi
else
    info "Installing Node.js v${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    ok "Node.js $(node -v) installed"
fi

# ── Step 2: Install PM2 ───────────────────────────────────
info "Checking PM2..."
if command -v pm2 &>/dev/null; then
    ok "PM2 already installed"
else
    info "Installing PM2 globally..."
    npm install -g pm2
    ok "PM2 installed"
fi

# ── Step 3: Copy app files to private/ ─────────────────────
info "Setting up app at ${APP_DIR}..."
mkdir -p "$APP_DIR"

rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'logs' \
    --exclude '.signing-secret' \
    "${REPO_DIR}/" "${APP_DIR}/"

ok "Files synced to ${APP_DIR}"

# ── Step 4: Install dependencies ──────────────────────────
info "Installing npm dependencies..."
cd "$APP_DIR"
npm ci --production 2>/dev/null || npm install --production
ok "Dependencies installed"

# ── Step 5: Create .env if missing ─────────────────────────
if [ ! -f "${APP_DIR}/.env" ]; then
    warn ".env not found — creating one now."
    echo ""

    read -rp "  OpenAI API Key: " OPENAI_KEY
    read -rp "  Admin username [admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}
    read -rsp "  Admin password: " ADMIN_PASS
    echo ""

    cat > "${APP_DIR}/.env" <<ENVEOF
NODE_ENV=production
PORT=${APP_PORT}
OPENAI_API_KEY=${OPENAI_KEY}
AUTH_USERNAME=${ADMIN_USER}
AUTH_PASSWORD=${ADMIN_PASS}
ALLOWED_ORIGINS=https://${DOMAIN}
ENVEOF

    chmod 600 "${APP_DIR}/.env"
    ok ".env created"
else
    ok ".env already exists — skipping"
fi

# ── Step 6: Fix ownership ─────────────────────────────────
info "Setting file ownership..."
chown -R "${HESTIA_USER}:${HESTIA_USER}" "${DOMAIN_DIR}/private"
ok "Ownership set to ${HESTIA_USER}"

# ── Step 7: Detect web stack and install nginx template ────
info "Detecting HestiaCP web stack..."

# Determine if this server uses Nginx+Apache or Nginx standalone
PROXY_SYSTEM=$(grep -oP "^PROXY_SYSTEM='\K[^']*" /usr/local/hestia/conf/hestia.conf 2>/dev/null || echo "")
WEB_SYSTEM=$(grep -oP "^WEB_SYSTEM='\K[^']*" /usr/local/hestia/conf/hestia.conf 2>/dev/null || echo "")

if [ -n "$PROXY_SYSTEM" ] && [ "$PROXY_SYSTEM" = "nginx" ]; then
    # Nginx + Apache mode: templates go in nginx/ (proxy templates)
    TEMPLATE_DIR="/usr/local/hestia/data/templates/web/nginx"
    LISTEN_PORT="%proxy_port%"
    LISTEN_SSL_PORT="%proxy_ssl_port%"
    TPL_COMMAND="v-change-web-domain-proxy-tpl"
    ok "Detected: Nginx (proxy) + Apache — using proxy templates"
elif [ "$WEB_SYSTEM" = "nginx" ]; then
    # Nginx standalone: templates go in nginx/php-fpm/
    TEMPLATE_DIR="/usr/local/hestia/data/templates/web/nginx/php-fpm"
    LISTEN_PORT="%web_port%"
    LISTEN_SSL_PORT="%web_ssl_port%"
    TPL_COMMAND="v-change-web-domain-tpl"
    ok "Detected: Nginx standalone — using web templates"
else
    # Fallback: assume Nginx + Apache
    TEMPLATE_DIR="/usr/local/hestia/data/templates/web/nginx"
    LISTEN_PORT="%proxy_port%"
    LISTEN_SSL_PORT="%proxy_ssl_port%"
    TPL_COMMAND="v-change-web-domain-proxy-tpl"
    warn "Could not detect stack. Assuming Nginx + Apache."
fi

info "Installing nginx template 'nodeapp' in ${TEMPLATE_DIR}..."

# ── HTTP template ──
cat > "${TEMPLATE_DIR}/nodeapp.tpl" <<EOF
server {
    listen      %ip%:${LISTEN_PORT};
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
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        # SSE support (document humanization progress)
        proxy_buffering off;
        proxy_cache     off;
    }

    location /error/ {
        alias %home%/web/%domain%/document_errors/;
    }

    location ~ /\.(?!well-known\/) {
        deny all;
        return 404;
    }

    include %home%/conf/web/%domain%/nginx.conf_*;
}
EOF

# ── HTTPS template ──
cat > "${TEMPLATE_DIR}/nodeapp.stpl" <<EOF
server {
    listen      %ip%:${LISTEN_SSL_PORT} ssl;
    server_name %domain_idn% %alias_idn%;

    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;
    ssl_stapling        on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "SAMEORIGIN" always;

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
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        # SSE support (document humanization progress)
        proxy_buffering off;
        proxy_cache     off;
    }

    location /error/ {
        alias %home%/web/%domain%/document_errors/;
    }

    location ~ /\.(?!well-known\/) {
        deny all;
        return 404;
    }

    include %home%/conf/web/%domain%/nginx.ssl.conf_*;
}
EOF

ok "Templates installed: nodeapp.tpl / nodeapp.stpl"

# ── Step 8: Apply template to domain ──────────────────────
info "Applying 'nodeapp' template to ${DOMAIN}..."
/usr/local/hestia/bin/${TPL_COMMAND} "$HESTIA_USER" "$DOMAIN" "nodeapp"
ok "Template applied via ${TPL_COMMAND}"

# ── Step 9: Enable SSL (Let's Encrypt) ────────────────────
info "Checking SSL..."

# Check if SSL cert already exists for this domain
if [ -f "${HOME_DIR}/conf/web/${DOMAIN}/ssl/${DOMAIN}.pem" ]; then
    ok "SSL certificate already exists"
else
    info "Requesting Let's Encrypt certificate..."
    /usr/local/hestia/bin/v-add-letsencrypt-domain "$HESTIA_USER" "$DOMAIN" "" "yes" 2>/dev/null && \
        ok "SSL certificate issued" || \
        warn "SSL failed. Ensure DNS A record for ${DOMAIN} points to this server, then run:\n  /usr/local/hestia/bin/v-add-letsencrypt-domain ${HESTIA_USER} ${DOMAIN}"
fi

# ── Step 10: Start app with PM2 ───────────────────────────
info "Starting app with PM2..."

# HestiaCP users have /usr/sbin/nologin — must use -s /bin/bash
su -s /bin/bash "$HESTIA_USER" -c "pm2 delete ${PM2_APP_NAME} 2>/dev/null || true"
su -s /bin/bash "$HESTIA_USER" -c "cd ${APP_DIR} && PORT=${APP_PORT} NODE_ENV=production pm2 start src/server.js --name ${PM2_APP_NAME}"
su -s /bin/bash "$HESTIA_USER" -c "pm2 save"

# PM2 startup: survives server reboot
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$HESTIA_USER" --hp "$HOME_DIR" 2>/dev/null || true

ok "App running as PM2 process '${PM2_APP_NAME}'"

# ── Step 11: Rebuild web domain & restart nginx ────────────
info "Rebuilding web config and restarting nginx..."
/usr/local/hestia/bin/v-rebuild-web-domain "$HESTIA_USER" "$DOMAIN"
systemctl restart nginx
ok "Nginx restarted"

# ── Done ───────────────────────────────────────────────────
echo ""
echo "=================================================="
echo -e "  ${GREEN}Deployment complete!${NC}"
echo ""
echo "  URL:       https://${DOMAIN}"
echo "  App dir:   ${APP_DIR}"
echo "  PM2 name:  ${PM2_APP_NAME}"
echo ""
echo "  Useful commands (run as root):"
echo "    su -s /bin/bash ${HESTIA_USER} -c 'pm2 logs ${PM2_APP_NAME}'"
echo "    su -s /bin/bash ${HESTIA_USER} -c 'pm2 restart ${PM2_APP_NAME}'"
echo "    su -s /bin/bash ${HESTIA_USER} -c 'pm2 monit'"
echo ""
echo "  Redeploy after changes:"
echo "    cd ${APP_DIR} && git pull"
echo "    npm ci --production"
echo "    su -s /bin/bash ${HESTIA_USER} -c 'pm2 restart ${PM2_APP_NAME}'"
echo "=================================================="
echo ""
