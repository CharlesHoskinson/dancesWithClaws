#!/usr/bin/env bash
set -euo pipefail

# Logan VM Setup Script
# Run once on a fresh Ubuntu 24.04 Azure VM.
# Usage: sudo bash setup.sh

DEPLOY_USER="logan"
PROJECT_DIR="/opt/logan"
REPO_URL="git@github.com:CharlesHoskinson/dancesWithClaws.git"

echo "=== Logan VM Setup ==="

# 1. System updates
echo "[1/8] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Docker
echo "[2/8] Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed."
fi

# 3. Create deploy user (if not already the current user)
echo "[3/8] Configuring user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
  # Copy SSH authorized_keys from root
  mkdir -p /home/$DEPLOY_USER/.ssh
  cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/authorized_keys 2>/dev/null || true
  chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
  chmod 700 /home/$DEPLOY_USER/.ssh
  chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys 2>/dev/null || true
else
  usermod -aG docker "$DEPLOY_USER"
  echo "  User $DEPLOY_USER already exists."
fi

# 4. Create project directory
echo "[4/8] Creating project directory..."
mkdir -p "$PROJECT_DIR"
chown $DEPLOY_USER:$DEPLOY_USER "$PROJECT_DIR"

# 5. Generate deploy key
echo "[5/8] Generating SSH deploy key..."
KEYFILE="/home/$DEPLOY_USER/.ssh/deploy_key"
if [ ! -f "$KEYFILE" ]; then
  su - $DEPLOY_USER -c "ssh-keygen -t ed25519 -f $KEYFILE -N '' -C 'logan-deploy-key'"
  echo ""
  echo "  ============================================"
  echo "  ADD THIS DEPLOY KEY TO YOUR GITHUB REPO:"
  echo "  Settings → Deploy Keys → Add deploy key"
  echo "  ============================================"
  echo ""
  cat "${KEYFILE}.pub"
  echo ""
  echo "  Press Enter after adding the key to GitHub..."
  read -r
else
  echo "  Deploy key already exists."
fi

# 6. Clone repo
echo "[6/8] Cloning repository..."
if [ ! -d "$PROJECT_DIR/dancesWithClaws" ]; then
  su - $DEPLOY_USER -c "GIT_SSH_COMMAND='ssh -i $KEYFILE -o StrictHostKeyChecking=accept-new' git clone $REPO_URL $PROJECT_DIR/dancesWithClaws"
else
  echo "  Repository already cloned."
fi

# 7. Create .env file
echo "[7/8] Setting up environment..."
ENV_FILE="$PROJECT_DIR/dancesWithClaws/deploy/.env"
if [ ! -f "$ENV_FILE" ]; then
  GATEWAY_TOKEN=$(openssl rand -hex 32)

  echo -n "Enter MOLTBOOK_API_KEY: "
  read -r MOLTBOOK_KEY
  echo -n "Enter OPENAI_API_KEY: "
  read -r OPENAI_KEY

  cat > "$ENV_FILE" <<EOL
MOLTBOOK_API_KEY=$MOLTBOOK_KEY
OPENAI_API_KEY=$OPENAI_KEY
OPENCLAW_GATEWAY_TOKEN=$GATEWAY_TOKEN
LOGAN_AGENT_ID=1f8d0506-e834-4a83-baf9-79de70b6cc87
SITE_DOMAIN=lobsterthoughts.eastus.cloudapp.azure.com
EOL

  chown $DEPLOY_USER:$DEPLOY_USER "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "  .env created at $ENV_FILE"
else
  echo "  .env already exists."
fi

# 8. Harden SSH and install fail2ban
echo "[8/8] Hardening security..."
apt-get install -y -qq fail2ban unattended-upgrades

# Disable password auth
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# Enable unattended security upgrades
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. su - $DEPLOY_USER"
echo "  2. cd $PROJECT_DIR/dancesWithClaws/deploy"
echo "  3. docker compose -f docker-compose.logan.yml up -d"
echo "  4. Check: docker compose -f docker-compose.logan.yml ps"
echo ""
