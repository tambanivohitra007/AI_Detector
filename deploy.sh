#!/bin/bash
#
# Deploy AI Text Humanizer to HestiaCP VPS
#
# Usage:
#   1. SSH into your VPS as root
#   2. Clone the repo:  git clone <repo-url> /tmp/ai-humanizer
#   3. Run:  bash /tmp/ai-humanizer/deploy.sh
#
# This script will:
#   - Install Node.js 20 (if missing)
#   - Install PM2 globally (if missing)
#   - Copy app files to /home/rindra/web/generator.rindra.org/nodeapp/
#   - Install npm dependencies
#   - Create .env from prompts
#   - Install custom nginx proxy templates for HestiaCP
#   - Apply the proxy template to the domain
#   - Start the app with PM2
#   - Enable SSL via Let's Encrypt
#

set -e

# ── Configuration ──────────────────────────────────────────
HESTIA_USER="rindra"
DOMAIN="generator.rindra.org"
APP_PORT=3000
NODE_VERSION=20

HOME_DIR="/home/${HESTIA_USER}"
APP_DIR="${HOME_DIR}/web/${DOMAIN}/nodeapp"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="/usr/local/hestia/data/templates/web/nginx"

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
    fail "User '${HESTIA_USER}' does not exist in HestiaCP."
fi

echo ""
echo "=================================================="
echo "  AI Text Humanizer — HestiaCP Deploy"
echo "  Domain: ${DOMAIN}"
echo "  User:   ${HESTIA_USER}"
echo "  Port:   ${APP_PORT}"
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

# ── Step 3: Create app directory & copy files ──────────────
info "Setting up app directory at ${APP_DIR}..."
mkdir -p "$APP_DIR"

# Copy project files (exclude node_modules, .git, .env, logs)
rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'logs' \
    --exclude '.signing-secret' \
    "${REPO_DIR}/" "${APP_DIR}/"

ok "Files copied to ${APP_DIR}"

# ── Step 4: Install dependencies ──────────────────────────
info "Installing npm dependencies..."
cd "$APP_DIR"
npm ci --production 2>/dev/null || npm install --production
ok "Dependencies installed"

# ── Step 5: Create .env if missing ─────────────────────────
if [ ! -f "${APP_DIR}/.env" ]; then
    warn ".env file not found — creating one now."
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
chown -R "${HESTIA_USER}:${HESTIA_USER}" "$APP_DIR"
ok "Ownership set to ${HESTIA_USER}"

# ── Step 7: Install nginx proxy templates ──────────────────
info "Installing nginx proxy templates..."

cat > "${TEMPLATE_DIR}/nodeapp.tpl" <<'TPLEOF'
server {
    listen      %ip%:%web_port%;
    server_name %domain_idn% %alias_idn%;

    include %home%/conf/web/%domain%/nginx.forcessl.conf*;

    location / {
        proxy_pass http://127.0.0.1:%backend_port%;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        # SSE support (document humanization progress)
        proxy_buffering off;
        proxy_cache off;
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
TPLEOF

cat > "${TEMPLATE_DIR}/nodeapp.stpl" <<'STPLEOF'
server {
    listen      %ip%:%web_ssl_port% ssl;
    server_name %domain_idn% %alias_idn%;

    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;
    ssl_stapling        on;
    ssl_stapling_verify on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://127.0.0.1:%backend_port%;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;

        # SSE support (document humanization progress)
        proxy_buffering off;
        proxy_cache off;
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
STPLEOF

ok "Nginx templates installed (nodeapp.tpl / nodeapp.stpl)"

# ── Step 8: Apply template to domain in HestiaCP ──────────
info "Applying proxy template to ${DOMAIN}..."

# Check if domain exists in HestiaCP
if /usr/local/hestia/bin/v-list-web-domain "$HESTIA_USER" "$DOMAIN" &>/dev/null; then
    # Change the proxy template and set backend port
    /usr/local/hestia/bin/v-change-web-domain-proxy-tpl "$HESTIA_USER" "$DOMAIN" "nodeapp" "tpl" "stpl"
    /usr/local/hestia/bin/v-change-web-domain-backend-cfg "$HESTIA_USER" "$DOMAIN" "$APP_PORT" 2>/dev/null || true
    ok "Proxy template applied"
else
    warn "Domain '${DOMAIN}' not found in HestiaCP."
    warn "Please create it in the HestiaCP panel first, then re-run this script."
    warn "Or create it now with:"
    echo "  /usr/local/hestia/bin/v-add-web-domain ${HESTIA_USER} ${DOMAIN}"
fi

# ── Step 9: Enable SSL (Let's Encrypt) ────────────────────
info "Checking SSL..."
SSL_STATUS=$(/usr/local/hestia/bin/v-list-web-domain "$HESTIA_USER" "$DOMAIN" json 2>/dev/null | grep -o '"SSL": "[^"]*"' | cut -d'"' -f4 || echo "no")

if [ "$SSL_STATUS" = "no" ] || [ -z "$SSL_STATUS" ]; then
    info "Requesting Let's Encrypt SSL certificate..."
    /usr/local/hestia/bin/v-add-letsencrypt-domain "$HESTIA_USER" "$DOMAIN" "" "yes" 2>/dev/null && \
        ok "SSL certificate issued" || \
        warn "SSL request failed. Make sure DNS for ${DOMAIN} points to this server, then run:\n  /usr/local/hestia/bin/v-add-letsencrypt-domain ${HESTIA_USER} ${DOMAIN}"
else
    ok "SSL already active"
fi

# ── Step 10: Start app with PM2 ───────────────────────────
info "Starting app with PM2..."

# Stop existing instance if running
su - "$HESTIA_USER" -c "pm2 delete ai-humanizer 2>/dev/null || true"

# Start the app
su - "$HESTIA_USER" -c "cd ${APP_DIR} && pm2 start src/server.js --name ai-humanizer --env production"

# Save PM2 process list so it survives reboot
su - "$HESTIA_USER" -c "pm2 save"

# Set up PM2 startup hook (survives server reboot)
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$HESTIA_USER" --hp "$HOME_DIR" 2>/dev/null || true

ok "App started with PM2"

# ── Step 11: Restart nginx ────────────────────────────────
info "Restarting nginx..."
systemctl restart nginx
ok "Nginx restarted"

# ── Done ───────────────────────────────────────────────────
echo ""
echo "=================================================="
echo -e "  ${GREEN}Deployment complete!${NC}"
echo ""
echo "  App:      https://${DOMAIN}"
echo "  App dir:  ${APP_DIR}"
echo "  PM2 name: ai-humanizer"
echo ""
echo "  Useful commands (run as ${HESTIA_USER}):"
echo "    pm2 logs ai-humanizer     # View logs"
echo "    pm2 restart ai-humanizer  # Restart app"
echo "    pm2 monit                 # Monitor CPU/RAM"
echo ""
echo "  To redeploy after git pull:"
echo "    sudo bash ${APP_DIR}/deploy.sh"
echo "=================================================="
echo ""
