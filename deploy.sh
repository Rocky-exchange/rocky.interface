#!/bin/bash
set -e

# ============================================
# Rocky Frontend Deploy Script
# ============================================
# Usage: ./deploy.sh
#
# Steps:
#   1. Build locally (yarn build)
#   2. Backup current deployment on server
#   3. Upload new build to server
#   4. Verify deployment
# ============================================

SERVER="ubuntu@13.231.118.218"
SSH_KEY="$HOME/.ssh/rocky-canton-sandbox.pem"
DEPLOY_DIR="/var/www/rocky"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
BACKUP_SUFFIX="$(date +%Y%m%d%H%M%S)"

SSH_CMD="ssh -i $SSH_KEY $SERVER"
SCP_CMD="scp -i $SSH_KEY"

echo "=========================================="
echo "  Rocky Frontend Deploy"
echo "=========================================="
echo "Server:     $SERVER"
echo "Deploy dir: $DEPLOY_DIR"
echo "Timestamp:  $BACKUP_SUFFIX"
echo ""

# Step 1: Build
echo "[1/4] Building production bundle..."
cd "$PROJECT_DIR"
yarn build || true

# Verify build output (yarn build may exit non-zero due to warnings)
if [ ! -d "$BUILD_DIR" ] || [ ! -f "$BUILD_DIR/index.html" ]; then
    echo "ERROR: Build failed - $BUILD_DIR/index.html not found"
    exit 1
fi

# Generate health.json with version info
VERSION=$(node -p "require('./package.json').version")
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "$BUILD_DIR/health.json" <<HEALTH_EOF
{"status":"ok","version":"${VERSION}","commit":"${GIT_HASH}","buildTime":"${BUILD_TIME}"}
HEALTH_EOF
echo "Generated health.json: v${VERSION} (${GIT_HASH})"

echo "Build complete."
echo ""

# Step 2: Backup current deployment on server
echo "[2/4] Backing up current deployment..."
$SSH_CMD "sudo cp -r $DEPLOY_DIR ${DEPLOY_DIR}.bak.${BACKUP_SUFFIX}"
echo "Backup saved to ${DEPLOY_DIR}.bak.${BACKUP_SUFFIX}"
echo ""

# Step 3: Upload new build
echo "[3/4] Uploading build to server..."
# Use rsync for efficient transfer, fall back to scp
if command -v rsync &>/dev/null; then
    rsync -az --delete -e "ssh -i $SSH_KEY" "$BUILD_DIR/" "$SERVER:$DEPLOY_DIR/"
else
    $SSH_CMD "rm -rf $DEPLOY_DIR/*"
    $SCP_CMD -r "$BUILD_DIR/"* "$SERVER:$DEPLOY_DIR/"
fi
echo "Upload complete."
echo ""

# Step 4: Verify
echo "[4/4] Verifying deployment..."
REMOTE_INDEX=$($SSH_CMD "test -f $DEPLOY_DIR/index.html && echo 'OK' || echo 'FAIL'")
if [ "$REMOTE_INDEX" = "OK" ]; then
    echo "Deployment verified - index.html exists."
    ASSET_COUNT=$($SSH_CMD "ls $DEPLOY_DIR/assets/*.js 2>/dev/null | wc -l")
    echo "JS assets: $ASSET_COUNT files"
else
    echo "ERROR: Deployment verification failed!"
    echo "Restoring backup..."
    $SSH_CMD "rm -rf $DEPLOY_DIR && mv ${DEPLOY_DIR}.bak.${BACKUP_SUFFIX} $DEPLOY_DIR"
    echo "Backup restored."
    exit 1
fi

echo ""
echo "=========================================="
echo "  Deploy successful!"
echo "  https://www.rocky.io"
echo "=========================================="
