#!/usr/bin/env bash
# Runs on the GitHub runner (.github/workflows/deploy.yml), or on a dev machine on the tailnet: streams the release of one
# commit to the VM's farm-deploy over ssh and prints its log (README "Deploys").
# Usage: deploy/oracle/ci-deploy.sh [<commit>]      (default HEAD)
# Env: DEPLOY_HOST (required: the VM's tailnet name); DEPLOY_USER (default deploy); DEPLOY_SSH_KEY (the private key's text,
# else ssh's own keys); DEPLOY_KNOWN_HOSTS (the VM's host key line, else ssh's own known_hosts); DEPLOY_LOCK_TRIES (5)
# and DEPLOY_LOCK_WAIT (60 s): how often and how long apart to try again while another deploy holds the VM's lock.
# Exit: farm-deploy's (0 deployed, 1 refused, 2 rolled back, 3 look now, 75 another deploy running); 255 ssh failed.
set -euo pipefail
host="${DEPLOY_HOST:?DEPLOY_HOST: the tailnet name of the VM}"
user="${DEPLOY_USER:-deploy}"
cd "$(git rev-parse --show-toplevel)" || exit 1
sha="$(git rev-parse --verify "${1:-HEAD}^{commit}")"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  (umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" >"$work/key")
  ssh_opts+=(-i "$work/key" -o IdentitiesOnly=yes)
fi
if [[ -n "${DEPLOY_KNOWN_HOSTS:-}" ]]; then
  printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >"$work/known_hosts"
  ssh_opts+=(-o UserKnownHostsFile="$work/known_hosts" -o StrictHostKeyChecking=yes)
fi

git archive --format=tar.gz -o "$work/release.tar.gz" "$sha" package.json server device web deploy
echo "Deploying $sha ($(du -k "$work/release.tar.gz" | cut -f1) kB) to $user@$host"
tries="${DEPLOY_LOCK_TRIES:-5}"
for (( try = 1; ; try++ )); do
  rc=0
  ssh "${ssh_opts[@]}" "$user@$host" "sudo /usr/local/sbin/farm-deploy $sha" <"$work/release.tar.gz" || rc=$?
  # 75: a deploy by hand holds the lock; wait for it
  (( rc == 75 && try < tries )) || break
  echo "Another deploy is running; trying again in ${DEPLOY_LOCK_WAIT:-60} s ($try of $tries)"
  sleep "${DEPLOY_LOCK_WAIT:-60}"
done
if (( rc == 0 )); then
  echo "Deployed $sha"
else
  echo "::error title=Deploy failed::farm-deploy exit $rc (2 = rolled back; 3 = look at the farm now). The log above has why"
  exit "$rc"
fi
