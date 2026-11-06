#!/usr/bin/env bash
# Run once on the Oracle VM (Ubuntu 24.04, as the ubuntu user, with sudo): Node 22, Tailscale, the farm user, the units.
set -euo pipefail
sudo timedatectl set-timezone Asia/Kuala_Lumpur
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
id farm >/dev/null 2>&1 || sudo useradd --system --home /opt/mushroom-farm --shell /usr/sbin/nologin farm
sudo mkdir -p /opt/mushroom-farm/data/gateways
sudo chown -R farm:farm /opt/mushroom-farm
sudo cp /opt/mushroom-farm/deploy/oracle/*.service /etc/systemd/system/
sudo systemctl daemon-reload
node -v
