#!/usr/bin/env bash
# Run on the dev machine: copy the code at HEAD (no data, no git history) plus this folder to the VM.
# Usage: deploy/oracle/push-code.sh <ssh-host>     Then on first deploy: ssh <host> bash /opt/mushroom-farm/deploy/oracle/setup-vm.sh
set -euo pipefail
host="${1:?ssh host}"
cd "$(git rev-parse --show-toplevel)"
ssh "$host" 'sudo mkdir -p /opt/mushroom-farm'
git archive --format=tar HEAD package.json server device web | ssh "$host" 'sudo tar -x -C /opt/mushroom-farm'
tar -c deploy/oracle | ssh "$host" 'sudo tar -x -C /opt/mushroom-farm'
# units are never copied from the app's tree: setup-vm.sh (first set-up) and setup-deploy.sh install them
ssh "$host" 'if id farm >/dev/null 2>&1; then sudo chown -R farm:farm /opt/mushroom-farm; fi'
