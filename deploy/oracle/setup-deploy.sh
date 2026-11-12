#!/usr/bin/env bash
# Run ONCE on the VM, with sudo (README "Deploys"), from a fresh scp of deploy/oracle/ you have reviewed, never from
# /opt/mushroom-farm (the app's user can change that copy): the deploy user GitHub's deploy job signs in as, its key, a
# root-owned /usr/local/sbin/farm-deploy, root's deploy records folder, the systemd units, and the one sudo rule letting
# deploy run farm-deploy. Run it again the same way after farm-deploy or a unit changes: deploys never install either.
# Usage: sudo bash setup-deploy.sh '<ed25519 public key line>' [<vm>.<tailnet>.ts.net]
#   (farm-deploy and the .service files sit next to this script). With the VM's name it prints the DEPLOY_KNOWN_HOSTS line.
set -euo pipefail
die() { echo "setup-deploy: $*" >&2; exit 1; }
(( EUID == 0 )) || die "run with sudo"
key="${1:-}"
name="${2:-}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
[[ "$here" != /opt/mushroom-farm && "$here" != /opt/mushroom-farm/* ]] || die "run it from a fresh scp, not from /opt/mushroom-farm"
[[ -f "$here/farm-deploy" ]] || die "no farm-deploy next to this script"
[[ "$key" == ssh-ed25519\ * && "$key" != *$'\n'* ]] || die "give the deploy key's public line: ssh-ed25519 AAAA... <comment>"
ssh-keygen -lf <(printf '%s\n' "$key") >/dev/null 2>&1 || die "that is not a valid public key"
sudo_version="$(sudo -V | sed -n 's/^Sudo version \([0-9.]*\).*/\1/p')"
[[ "$(printf '%s\n' 1.9.10 "$sudo_version" | sort -V | head -n 1)" == 1.9.10 ]] \
  || die "sudo $sudo_version cannot check the sha in the sudo rule (needs 1.9.10 or later)"

# the user: no password (the * is not a lock, so sshd still takes its key), a shell only to run the forced command
if ! id deploy >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/farm-deploy --shell /bin/sh deploy
fi
usermod --password '*' --shell /bin/sh deploy
home="$(getent passwd deploy | cut -d: -f6)"

# the key: from the tailnet only, no pty or forwarding, and whatever the client asks it runs only farm-deploy, with the
# last word of the request as the one argument (sudo takes only a 40-hex sha, and farm-deploy checks it again)
opts='restrict,from="100.64.0.0/10,fd7a:115c:a1e0::/48",command="exec sudo -n /usr/local/sbin/farm-deploy \"${SSH_ORIGINAL_COMMAND##* }\""'
install -d -m 700 -o deploy -g deploy "$home/.ssh"
printf '%s %s\n' "$opts" "$key" >"$home/.ssh/authorized_keys.new"
chown deploy:deploy "$home/.ssh/authorized_keys.new"
chmod 600 "$home/.ssh/authorized_keys.new"
mv -f "$home/.ssh/authorized_keys.new" "$home/.ssh/authorized_keys"

install -o root -g root -m 0755 "$here/farm-deploy" /usr/local/sbin/farm-deploy
# root's records: DEPLOYED and the code tars, out of the app user's reach
install -d -o root -g root -m 0700 /var/lib/farm-deploy-root /var/lib/farm-deploy-root/code

# the units, from this reviewed copy only
reload=0
for unit in mushroom-farm.service mushroom-device.service mushroom-gateway@.service; do
  [[ -f "$here/$unit" ]] || continue
  cmp -s "$here/$unit" "/etc/systemd/system/$unit" && continue
  install -o root -g root -m 0644 "$here/$unit" "/etc/systemd/system/$unit"
  echo "installed $unit: restart its services to use it"
  reload=1
done
if (( reload )); then systemctl daemon-reload; fi

sudoers="$(mktemp)"
trap 'rm -f "$sudoers"' EXIT
cat >"$sudoers" <<'EOF'
# deploy/oracle/setup-deploy.sh: the deploy user may run only farm-deploy as root, with one 40-hex sha, in a clean environment
Defaults!/usr/local/sbin/farm-deploy env_reset
deploy ALL=(root) NOPASSWD: /usr/local/sbin/farm-deploy ^[0-9a-f]{40}$
EOF
visudo -cf "$sudoers" >/dev/null || die "the sudoers rule does not validate"
install -o root -g root -m 0440 "$sudoers" /etc/sudoers.d/farm-deploy
visudo -c >/dev/null || { rm -f /etc/sudoers.d/farm-deploy; die "sudoers broke with the rule; removed it"; }

touch /var/log/farm-deploy.log
chmod 640 /var/log/farm-deploy.log

if sshd -T 2>/dev/null | grep -qiE '^(allowusers|allowgroups) '; then
  echo "warning: sshd has AllowUsers/AllowGroups: add deploy, or it cannot sign in" >&2
fi
if tailscale debug prefs 2>/dev/null | grep -q '"RunSSH": true'; then
  echo "warning: Tailscale SSH is on: it answers port 22 on the tailnet instead of sshd and ignores this key" >&2
fi
echo "deploy user, key, /usr/local/sbin/farm-deploy, /var/lib/farm-deploy-root and /etc/sudoers.d/farm-deploy ready"
if [[ -n "$name" ]]; then
  echo "DEPLOY_KNOWN_HOSTS secret:"
  printf '%s %s\n' "$name" "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
fi
