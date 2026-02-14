# Windows Setup Guide

These steps take you from a fresh Windows 11 machine to a running Logan agent inside the hardened two-container sandbox. Work through them in order. Each step has a verification command so you know it worked before moving on.

## Step 0: Enable WSL2

Open PowerShell as Administrator and run:

```powershell
wsl --install -d Ubuntu
```

This enables the Virtual Machine Platform, installs WSL2, and downloads Ubuntu. Reboot when prompted. After reboot, the Ubuntu terminal opens and asks you to create a Unix username and password.

Verify:

```powershell
wsl -l -v
```

You should see Ubuntu listed with VERSION 2.

## Step 1: Install Docker Desktop

Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/). During installation, select "Use WSL 2 based engine." After install, open Docker Desktop and go to Settings > Resources > WSL Integration. Turn on the toggle for your Ubuntu distro. Without this, `docker` commands inside WSL2 will not work.

Open your WSL2 Ubuntu terminal and verify:

```bash
docker --version
docker run --rm hello-world
```

If `docker` is not found, close and reopen the Ubuntu terminal. Docker Desktop must be running.

## Step 2: Harden WSL2

Create `C:\Users\<you>\.wslconfig` on the Windows side. Open a regular (non-WSL) terminal:

```powershell
notepad "$env:USERPROFILE\.wslconfig"
```

Paste this:

```ini
[wsl2]
memory=4GB
processors=2
localhostForwarding=false
```

`localhostForwarding=false` prevents services inside WSL2 from binding to your Windows localhost.

Next, open your WSL2 terminal and edit `/etc/wsl.conf`:

```bash
sudo tee /etc/wsl.conf > /dev/null << 'EOF'
[interop]
enabled=false
appendWindowsPath=false

[automount]
options="metadata,umask=077"
EOF
```

`interop=false` blocks WSL2 processes from launching Windows executables. A compromised sandbox cannot run `cmd.exe`, `powershell.exe`, or anything else on the Windows side.

These changes do not take effect until you fully restart WSL2. From a Windows terminal:

```powershell
wsl --shutdown
```

Then reopen your Ubuntu terminal.

Verify that interop is disabled:

```bash
cmd.exe
```

You should see "command not found" or a permission error. If `cmd.exe` launches a Windows prompt, `/etc/wsl.conf` was not applied. Run `wsl --shutdown` again and retry.

Note: with `interop=false`, the `openclaw tee credential` commands (Step 5b) must be run from a Windows terminal, not from inside WSL2. They call Windows Credential Manager, which requires interop.

## Step 3: Clone the repo

Inside WSL2, clone into your home directory. Do not clone to `/mnt/c/`. The Windows filesystem under `/mnt/c` is slow for Linux I/O and causes Docker bind-mount permission issues.

```bash
cd ~
git clone <repo-url> dancesWithClaws
cd ~/dancesWithClaws
```

If you already cloned the repo on the Windows side, you can reference it at `/mnt/c/Users/<you>/dancesWithClaws`. It will work, but builds and file watches will be slower.

## Step 4: Install Node.js and OpenClaw CLI

Inside WSL2:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install pnpm 10.23.0 (OpenClaw requires it):

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
```

Install the OpenClaw CLI:

```bash
npm install -g openclaw@latest
```

Verify:

```bash
node --version    # v22.x
pnpm --version    # 10.23.0
openclaw --version
```

## Step 5: Set API keys

Two API keys are required. Neither is stored in the repository.

| Key                | Where to get it                                           | Where to put it                                                           |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `MOLTBOOK_API_KEY` | Register an agent at [moltbook.com](https://moltbook.com) | `~/.config/moltbook/credentials.json` (chmod 600) + export in `~/.bashrc` |
| `OPENAI_API_KEY`   | [platform.openai.com](https://platform.openai.com)        | Export in `~/.bashrc`                                                     |

Add both to your `~/.bashrc` inside WSL2:

```bash
echo 'export MOLTBOOK_API_KEY="your-key-here"' >> ~/.bashrc
echo 'export OPENAI_API_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

The `openclaw.json` at the repo root declares these variables but stores no values:

```json
"env": {
  "vars": {
    "MOLTBOOK_API_KEY": "",
    "OPENAI_API_KEY": ""
  }
}
```

OpenClaw reads the values from your environment at runtime.

If you have a YubiHSM 2 and OpenBao set up (optional), store their secrets in Windows Credential Manager. Run these from a Windows terminal (not WSL2, because interop is disabled):

```powershell
openclaw tee credential store --target hsmPin
openclaw tee credential store --target openbaoToken
```

These are protected by Credential Guard at rest and only enter memory when needed. See the [security docs](security.md) for details.

## Step 6: Build Docker images

From your WSL2 terminal, inside the repo:

```bash
cd ~/dancesWithClaws
docker build -t openclaw-sandbox -f Dockerfile.sandbox .
docker build -t openclaw-proxy -f Dockerfile.proxy .
```

Note: in `Dockerfile.sandbox`, the `http_proxy` and `https_proxy` environment variables are set after `apt-get install`. If you modify the Dockerfile, keep that ordering. Setting proxy env vars before `apt-get` will break the package download since the proxy container does not exist at build time.

Verify:

```bash
docker images | grep openclaw
```

You should see both `openclaw-sandbox` and `openclaw-proxy`.

## Step 7: Create Docker network and start proxy

Create the bridge network with a fixed subnet. The sandbox container resolves `proxy` to `172.30.0.10` via the `extraHosts` and `dns` settings in `openclaw.json`.

```bash
docker network create --subnet=172.30.0.0/24 oc-sandbox-net
```

Start the proxy container:

```bash
docker run -d \
  --name openclaw-proxy \
  --network oc-sandbox-net \
  --ip 172.30.0.10 \
  --cap-drop ALL \
  --cap-add NET_ADMIN \
  --cap-add SETUID \
  --cap-add SETGID \
  --read-only \
  --tmpfs /var/log/squid:size=50m \
  --tmpfs /var/spool/squid:size=50m \
  --tmpfs /run:size=10m \
  --restart unless-stopped \
  openclaw-proxy
```

The proxy needs `NET_ADMIN` for iptables egress rules, and `SETUID`/`SETGID` because Squid drops privileges to the `squid` user at startup. Without those two caps, Squid fails silently or crashes on `chown`.

Verify:

```bash
docker ps --filter name=openclaw-proxy
docker logs openclaw-proxy
```

You should see "Starting Squid..." and the iptables rules in the log output.

## Step 8: Configure Windows Firewall

This locks down WSL2 so the sandbox cannot reach your LAN. Open PowerShell as Administrator on the Windows side:

```powershell
cd C:\Users\<you>\dancesWithClaws
.\security\windows-firewall-rules.ps1
```

If you cloned into WSL2 only (Step 3), copy the script out first or reference the WSL2 path:

```powershell
wsl cat ~/dancesWithClaws/security/windows-firewall-rules.ps1 | powershell -Command -
```

Verify:

```powershell
Get-NetFirewallRule -DisplayName "OpenClaw*" | Format-Table DisplayName, Direction, Action
```

You should see three rules: one Block (LAN), two Allow (HTTPS+DNS TCP, DNS UDP).

## Step 9: Run the onboarding wizard

Back in WSL2:

```bash
cd ~/dancesWithClaws
openclaw onboard --install-daemon
```

Follow the prompts. The wizard registers your agent identity with Moltbook and sets up the local daemon that manages heartbeat scheduling.

## Step 10: Start Logan

```bash
openclaw agent start logan
```

This spins up the sandbox container on the `oc-sandbox-net` network, connected to the proxy you started in Step 7.

Note: the seccomp profile path in `openclaw.json` is `./security/seccomp-sandbox.json`. OpenClaw resolves this relative to the repo root, but Docker needs an absolute path inside WSL2. If you see a seccomp-related error, check that OpenClaw is expanding it to something like `/home/<you>/dancesWithClaws/security/seccomp-sandbox.json`, not a `/mnt/c/` path.

Verify both containers are running:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

You should see `openclaw-proxy` and a sandbox container (name varies).

Test the proxy allowlist from inside the sandbox:

```bash
# Get the sandbox container name
SANDBOX=$(docker ps --filter ancestor=openclaw-sandbox --format "{{.Names}}")

# This should succeed (moltbook.com is allowlisted)
docker exec "$SANDBOX" curl -s -o /dev/null -w "%{http_code}" https://moltbook.com

# This should fail with 403 (evil.com is not allowlisted)
docker exec "$SANDBOX" curl -s -o /dev/null -w "%{http_code}" https://evil.com
```

Expected: `200` for the first, `403` for the second.

## Verification checklist

| What                     | Command                                                                             | Expected               |
| ------------------------ | ----------------------------------------------------------------------------------- | ---------------------- |
| WSL2 version             | `wsl -l -v`                                                                         | Ubuntu, VERSION 2      |
| Docker works in WSL2     | `docker run --rm hello-world`                                                       | "Hello from Docker!"   |
| Interop disabled         | `cmd.exe` inside WSL2                                                               | "command not found"    |
| Node.js version          | `node --version`                                                                    | v22.x                  |
| OpenClaw CLI installed   | `openclaw --version`                                                                | Version string         |
| API keys set             | `echo $MOLTBOOK_API_KEY`                                                            | Non-empty              |
| Docker images built      | `docker images \| grep openclaw`                                                    | sandbox and proxy rows |
| Proxy container running  | `docker ps --filter name=openclaw-proxy`                                            | Status: Up             |
| Firewall rules installed | `Get-NetFirewallRule -DisplayName "OpenClaw*"` (Windows PowerShell)                 | Three rules            |
| Proxy allows moltbook    | `docker exec <sandbox> curl -s -o /dev/null -w "%{http_code}" https://moltbook.com` | `200`                  |
| Proxy blocks evil.com    | `docker exec <sandbox> curl -s -o /dev/null -w "%{http_code}" https://evil.com`     | `403`                  |
