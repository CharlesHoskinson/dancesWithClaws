# hsm-logan-e2e

End-to-end harness that drives Logan (the Moltbook Cardano-educator agent) through one full turn using HSM-sealed credentials and a local Gemma model.

Flow:

1. Bootstrap a YubiHSM2 (real device or in-process simulator).
2. Seal `MOLTBOOK_API_KEY` + `PERPLEXITY_API_KEY` under a wrap key rooted in the HSM.
3. Unseal the two secrets into memory.
4. Run Logan: Perplexity research -> local Gemma summary -> Moltbook post.

## Prereqs

- **Ollama** running on `127.0.0.1:11434` with the `gemma4:e4b` model pulled. The harness probes but does not spawn `ollama serve` — this lives in scoop on the operator's machine and runs as a service.
- **yubihsm-connector** running (default `http://localhost:12345`) when `--device` is passed. The simulator path (no flag) does not need it.
- A YubiHSM2 plugged in for real-device runs. Driver binding must be via Zadig (libusb). See Yubico's quickstart for the connector setup.
- Env vars `MOLTBOOK_API_KEY` and `PERPLEXITY_API_KEY` exported in the shell before invocation. The harness refuses to run if either is missing.

## Simulator run (no hardware needed)

```
cd tools/hsm-logan-e2e
pnpm install
pnpm tsx run.ts
```

Expected wall time: ~5–30s depending on how long Gemma takes to summarize. Expected output: JSON on stdout with `serial`, `rotated`, `moltbookPostId`, `loganPost`, `sealedPath`.

## Real-device run

```
cd tools/hsm-logan-e2e
pnpm tsx run.ts --device
```

Optional overrides:

- `--connector <url>` — yubihsm-connector URL. Default `http://localhost:12345`.
- `--ollama-port <n>` — Ollama port. Default `11434`.
- `--moltbook-endpoint <url>` — override the production URL (tests use a mock).
- `--topic "<string>"` — force a specific research topic. Default: today's biggest Cardano governance story.

Expected wall time on real silicon: ~30–60s (PBKDF2 + SCP03 handshake + blueprint apply is the long pole, Ollama generation second).

Expected output:

```
[logan-e2e] probing Ollama on port 11434
[logan-e2e] ensuring model 'gemma4:e4b' is pulled
[logan-e2e] using real yubihsm-connector at http://localhost:12345
[logan-e2e] bootstrapping HSM (blueprint=...)
[logan-e2e] bootstrap done: serial=<n> rotated=true recovered=false
[logan-e2e] sealed secrets written to <HOME>/.openclaw/sealed-secrets
[logan-e2e] running Logan turn
[logan-e2e] Logan posted (id=mlt_<id>): <post content>
```

## Sealing caveat (Plan 03 backlog)

The driver doesn't yet expose `WrapData` / `GenerateWrapKey` / `UnwrapData` commands, so this harness uses a fallback:

- Open the admin session.
- Generate 32 random bytes locally.
- Install those bytes as a plugin-sealer auth key on the device (`putAuthenticationKey`).
- Use the same 32 bytes as an AES-GCM-256 wrap key in memory.

HSM possession remains required to re-establish the sealing root (the admin creds live in Credential Manager / creds file; the auth key installation is audit-logged on the device). But the crypto runs in Node, not on the HSM. Once `WrapData` / `GenerateWrapKey` land in `packages/yubihsm/src/commands/`, swap `run.ts`'s `deriveHsmRootedWrapKey` for a real wrap-key handle.

## Running the smoke test

```
cd tools/hsm-logan-e2e
pnpm test
```

This intercepts Perplexity, Moltbook, and Ollama via `undici.MockAgent` and exercises the full simulator path.

## Troubleshooting

- **"Ollama is not reachable"** — start `ollama serve` or the scoop service; `curl http://127.0.0.1:11434/api/tags` should return JSON.
- **Model not pulled** — `ollama pull gemma4:e4b`. First pull is ~3GB.
- **"HSM_UNAVAILABLE" from the driver** — the connector isn't listening. Start `yubihsm-connector -d` (or the Windows service). Check `curl http://localhost:12345/connector/status`.
- **"libusb" / driver-not-bound on Windows** — re-install the driver with Zadig. Yubico ships a libusb INF; point Zadig at your YubiHSM2 and pick WinUSB.
- **"missing MOLTBOOK_API_KEY"** — export both `MOLTBOOK_API_KEY` and `PERPLEXITY_API_KEY` in the current shell before running. The harness intentionally refuses to fall back to defaults.
- **Post doesn't appear on Moltbook** — check the Moltbook API rate limits; SKILL.md enforces a 1s floor between calls.
