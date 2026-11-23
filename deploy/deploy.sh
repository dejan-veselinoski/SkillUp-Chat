#!/bin/bash
# Run this from Git Bash on Windows.
# You will be asked for the VPS password ONCE.

VPS_IP="37.60.249.140"
VPS_USER="root"
REMOTE="$VPS_USER@$VPS_IP"
APP_DIR="/opt/skillup-chat"
CTRL="/tmp/skillup-ssh-$$"   # unique control socket per run

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

SSH="ssh -o StrictHostKeyChecking=no -o ControlPath=$CTRL"
SCP="scp -o StrictHostKeyChecking=no -o ControlPath=$CTRL"

cleanup() { ssh -o ControlPath="$CTRL" -O exit "$REMOTE" 2>/dev/null || true; }
trap cleanup EXIT

echo "========================================"
echo "  SkillUp Chat — VPS Deployment"
echo "  Target: $VPS_IP"
echo "========================================"
echo ""

# Open a persistent SSH connection — single password prompt
echo "Connecting to $VPS_IP (enter password once)..."
ssh -M -S "$CTRL" -f -N -o StrictHostKeyChecking=no "$REMOTE"
echo "Connected."
echo ""

# Create directory tree on VPS
echo "--- Creating app directories ---"
$SSH "$REMOTE" "mkdir -p $APP_DIR/middleware $APP_DIR/routes $APP_DIR/uploads $APP_DIR/data"

# Upload backend files
echo "--- Uploading backend files ---"
$SCP "$BACKEND_DIR/server.js"                "root@$VPS_IP:$APP_DIR/"
$SCP "$BACKEND_DIR/db.js"                    "root@$VPS_IP:$APP_DIR/"
$SCP "$BACKEND_DIR/package.json"             "root@$VPS_IP:$APP_DIR/"
$SCP "$BACKEND_DIR/ecosystem.config.js"      "root@$VPS_IP:$APP_DIR/"
$SCP "$BACKEND_DIR/middleware/auth.js"       "root@$VPS_IP:$APP_DIR/middleware/"
$SCP "$BACKEND_DIR/routes/auth.js"           "root@$VPS_IP:$APP_DIR/routes/"
$SCP "$BACKEND_DIR/routes/messages.js"       "root@$VPS_IP:$APP_DIR/routes/"

# Upload and run the VPS setup script
echo ""
echo "--- Uploading setup script ---"
$SCP "$SCRIPT_DIR/setup-vps.sh"             "root@$VPS_IP:/tmp/setup-vps.sh"
$SSH "$REMOTE" "chmod +x /tmp/setup-vps.sh"

echo ""
echo "--- Running setup on VPS ---"
$SSH "$REMOTE" "bash /tmp/setup-vps.sh"
