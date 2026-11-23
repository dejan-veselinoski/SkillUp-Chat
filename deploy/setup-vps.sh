#!/bin/bash
# Runs on the VPS after files have been uploaded.
set -e

APP_DIR="/opt/skillup-chat"
cd "$APP_DIR"

echo ""
echo "=== [1/6] Checking Node.js ==="
NODE_VER=$(node --version 2>/dev/null | grep -oP '\d+' | head -1 || echo "0")
if [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
  echo "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>&1 | tail -5
  apt-get install -y nodejs 2>&1 | tail -5
fi
echo "Node: $(node --version)   npm: $(npm --version)"

echo ""
echo "=== [2/6] Installing PM2 ==="
npm install -g pm2 2>&1 | tail -3

echo ""
echo "=== [3/6] Installing app dependencies ==="
npm install --production 2>&1 | tail -5

echo ""
echo "=== [4/6] Creating .env ==="
if [ ! -f .env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  printf 'PORT=3000\nJWT_SECRET=%s\n' "$JWT_SECRET" > .env
  echo ".env created."
else
  echo ".env already exists, keeping it."
fi

echo ""
echo "=== [5/6] Starting app with PM2 ==="
pm2 delete skillup-chat 2>/dev/null || true
pm2 start server.js --name skillup-chat
pm2 save --force

# Configure PM2 to start on boot
PM2_PATH=$(which pm2)
"$PM2_PATH" startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash || true
systemctl enable pm2-root 2>/dev/null || true

echo ""
echo "=== [6/6] Firewall ==="
if command -v ufw &>/dev/null; then
  ufw allow 3000/tcp 2>/dev/null || true
  echo "UFW: port 3000 allowed."
else
  echo "UFW not found — ensure port 3000 is open in your VPS control panel."
fi

echo ""
echo "=== PM2 status ==="
pm2 status

echo ""
echo "=== Health check ==="
sleep 2
curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/health

echo ""
echo "============================================="
echo "  Deployment complete!"
echo "  API URL: http://$(curl -s ifconfig.me 2>/dev/null || echo '37.60.249.140'):3000"
echo "  Test:    curl http://37.60.249.140:3000/health"
echo "============================================="
