#!/usr/bin/env bash
# Run on the dev machine with the LOCAL farm app and device apps STOPPED (the database is locked while it runs).
# Copies the database and the simulators' state to the VM, then starts everything there. Usage: deploy/oracle/push-data.sh <ssh-host>
set -euo pipefail
host="${1:?ssh host}"
cd "$(git rev-parse --show-toplevel)"
if ss -ltn | grep -qE ':(8080|8090|809[2-4]|1502|151[2-4])\b'; then echo "local farm/device apps still running: stop them first" >&2; exit 1; fi
ssh "$host" 'sudo systemctl stop mushroom-farm mushroom-device mushroom-gateway@{alpha,beta,gamma} 2>/dev/null || true'
tar -cz data/v2.db data/gateways/{alpha,beta,gamma}.json{,.sim} device/state.json{,.sim} \
  | ssh "$host" 'sudo tar -xz -C /opt/mushroom-farm && sudo chown -R farm:farm /opt/mushroom-farm'
ssh "$host" 'sudo systemctl enable --now mushroom-device mushroom-gateway@{alpha,beta,gamma} && sleep 2 && sudo systemctl enable --now mushroom-farm && systemctl --no-pager is-active mushroom-farm mushroom-device mushroom-gateway@{alpha,beta,gamma}'
