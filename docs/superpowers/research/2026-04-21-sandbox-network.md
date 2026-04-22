---
topic: Sandbox → host Ollama reachability without weakening sandbox posture
date: 2026-04-21
status: research-complete
recommendation: Unix-socket bind-mount (primary) with Squid forward as non-streaming fallback
confidence: 0.70
---

# Sandbox Networking Research — Logan

## Constraints Recap

- Sandbox network `oc-sandbox-net` (172.30.0.0/24)
- DNS forced to proxy at 172.30.0.10, no default route to host
- Only `curl` on safeBins
- readOnlyRoot, capDrop ALL, seccomp
- Proxy allowlist is domain-based (Moltbook + explicit)
- Ollama on host Windows at 127.0.0.1:11434

## Approaches Evaluated

### 1. `host.docker.internal` + proxy allowlist entry

- Fragile on WSL2: Docker Desktop resolves `host.docker.internal` unreliably from custom bridges with overridden DNS.
- Requires explicit IP mapping + iptables drop-override in proxy container.
- Expands host-access surface: any service on the host gateway IP becomes reachable. **Not recommended.**

### 2. Ollama as a sidecar on `oc-sandbox-net`

- Duplicates model storage (up to ~60 GB if all four Gemma 4 variants coexist).
- GPU passthrough on WSL2 Docker Desktop is poorly supported; likely CPU-only inference inside the container → unusable latency at 26B/31B.
- Removes proxy egress need but creates memory contention in the WSL2 VM.
- **Not recommended** for this setup. Valid only on a dedicated GPU host.

### 3. **Unix-socket bind-mount (recommended primary)**

- Ollama supports Unix socket listening (`OLLAMA_HOST=unix:///tmp/ollama.sock`).
- Bind-mount the socket read-only into the sandbox: `--volume /tmp/ollama.sock:/tmp/ollama.sock:ro`.
- Sandbox calls: `curl --unix-socket /tmp/ollama.sock http://localhost/api/chat`.
- Zero new network egress paths. Zero proxy changes. Zero model duplication. Full GPU on host.
- **Hard dependency:** Ollama must run inside WSL2 (not bare Windows), so the socket path is accessible from the Docker-in-WSL2 VM.

### 4. Squid HTTP forward for `ollama.lan`

- Add `ollama.lan` to proxy allowlist, map to host IP, add iptables allow for dst port 11434 from proxy → host.
- Works for non-streaming requests.
- **Streaming failure risk:** Squid's `read_timeout` (60s default) can close mid-stream; chunked / NDJSON Ollama stream responses may buffer.
- **Fallback only** if socket approach isn't available, and only if all Ollama calls are non-streaming.

## Comparison

| Criterion        | host.docker.internal | Sidecar Ollama      | Unix socket           | Squid forward      |
| ---------------- | -------------------- | ------------------- | --------------------- | ------------------ |
| Complexity       | Medium               | High                | Low                   | Medium             |
| New egress paths | Host gateway (broad) | None                | None                  | Proxy → host:11434 |
| Memory overhead  | 0                    | +60 GB models + RAM | 0                     | 0                  |
| GPU              | Host GPU ✓           | WSL2 passthrough ✗  | Host GPU ✓            | Host GPU ✓         |
| Streaming OK     | ✓                    | ✓                   | ✓                     | ✗ (risk)           |
| WSL2 friendly    | ✗                    | △                   | ✓ (if Ollama in WSL2) | ✓                  |

## Recommendation

**Primary: Unix-socket bind-mount.** Move Ollama into WSL2 (or confirm it's already there) and expose `/tmp/ollama.sock`. Mount into the sandbox read-only. Chat/embedding clients use `--unix-socket`.

**Fallback: Squid HTTP forward** via `ollama.lan` — only if socket isn't viable AND after verifying streaming latency against a real Gemma 4 chat turn.

## Gotchas

1. **Socket path confusion on WSL2.** If Ollama is installed on bare Windows (current state: scoop install), its socket lives on NTFS and is unreachable from the Docker-in-WSL2 VM. Reinstall Ollama inside WSL2 (or add the curl.exe-style cross-boundary hack, which is ugly).
2. **Squid streaming timeouts.** Default `read_timeout 60s` is shorter than Gemma 4:31b's cold-start-first-token time on CPU. If falling back to Squid, raise it and test end-to-end with a real streaming response.
3. **DNS forced to proxy + extraHosts ordering.** `extraHosts` entries populate `/etc/hosts` and are consulted before the proxy DNS; but the iptables rules in the proxy container only see raw IPs, so a resolved IP must also match an allowed destination. Silent failure at the TCP level is the typical symptom.
4. **readOnlyRoot vs sockets.** `connect(2)` to a bind-mounted socket bypasses the RO-filesystem constraint. Good — this works. But it means no file-permission mechanism authenticates the caller; Ollama has no auth. Any process inside the sandbox can issue any Ollama API call (including model manage/delete). Mitigate by limiting socket permissions and by pinning the Ollama process to expose only the needed endpoints (reverse-proxy a small shim if needed).

## Open Questions for the Unified Design

- Is Ollama currently in WSL2 or on bare Windows? (Check `where ollama` — current CLI shows `C:\Users\charl\scoop\shims\ollama.exe` → **bare Windows**. Must migrate.)
- Does the proxy allowlist need an Ollama entry at all? (No, if socket.)
- Do we need to harden Ollama against in-sandbox abuse via a shim?
