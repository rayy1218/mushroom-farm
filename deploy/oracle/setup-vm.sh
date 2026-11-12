#!/usr/bin/env bash
# Run once on the Oracle VM (Ubuntu 24.04, as the ubuntu user, with sudo): Node 22, Tailscale, the farm user, the units.
# The units come from /opt/mushroom-farm, which the app's user owns: so only on a fresh VM, before the app has ever run.
# After that, units change only through setup-deploy.sh from a reviewed copy.
set -euo pipefail
if [[ -e /etc/systemd/system/mushroom-farm.service ]]; then
  echo "setup-vm: already set up; install changed units with setup-deploy.sh (README, Deploys)" >&2; exit 1
fi
if id farm >/dev/null 2>&1 && pgrep -u farm >/dev/null; then
  echo "setup-vm: the farm user is running something; this is for a fresh VM only" >&2; exit 1
fi
sudo timedatectl set-timezone Asia/Kuala_Lumpur
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
id farm >/dev/null 2>&1 || sudo useradd --system --home /opt/mushroom-farm --shell /usr/sbin/nologin farm
sudo mkdir -p /opt/mushroom-farm/data/gateways
sudo chown -R farm:farm /opt/mushroom-farm
for unit in mushroom-farm.service mushroom-device.service mushroom-gateway@.service; do
  sudo install -o root -g root -m 0644 "/opt/mushroom-farm/deploy/oracle/$unit" "/etc/systemd/system/$unit"
done
sudo systemctl daemon-reload
node -v
