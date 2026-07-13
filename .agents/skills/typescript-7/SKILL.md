---
name: typescript-7
description: >
  Use TypeScript 7 (native Go compiler / tsgo) for typecheck and CI in this monorepo.
  Trigger when: TypeScript 7, tsgo, native-preview, tsc7, parallel checkers, side-by-side
  with TypeScript 6 API, eslint peer typescript, or migrating typecheck off tsc6.
---

# TypeScript 7 (native) — OpenClaw / Logan

## What TS 7 is

- **Native Go port** of the TypeScript compiler and language tooling (Project Corsa).
- Typical **8–12×** full-build speedups vs TypeScript 6; lower memory.
- **No stable programmatic API** in 7.0 (expected in 7.1). Tools that `import "typescript"` (eslint, Volar, Next.js plugin, etc.) still need **TypeScript 6 side-by-side**.

Official: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

## This repo’s layout (authoritative)

| Package | Role |
|---------|------|
| `typescript` (currently 6.x) | JS API for eslint / programmatic tools |
| `@typescript/native-preview` | TS 7 `tsgo` binary (nightly/dev builds) |
| `scripts/run-tsgo.mjs` | Policy wrapper: locks, sparse guards, local heavy-check |
| `pnpm tsgo:core` / `tsgo:all` / … | Project-scoped typecheck entrypoints |

Prefer **`node scripts/run-tsgo.mjs …`** or **`pnpm tsgo:*`** over raw `npx tsc` for monorepo typecheck.

## When implementing features

1. **Write normal TypeScript** — language surface is TS 6-compatible; do not rely on 7.0-only type-level UTF-16 quirks without checking.
2. **Typecheck with tsgo** for packages you touch:
   ```powershell
   pnpm tsgo:core
   # or focused:
   node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo
   ```
3. **Do not** replace root `typescript` with 7-only if it breaks eslint. Keep 6 API + 7 native binary.
4. Optional future alias pattern (Microsoft recommended) when upgrading past native-preview:
   ```json
   {
     "devDependencies": {
       "@typescript/native": "npm:typescript@^7.0.2",
       "typescript": "npm:@typescript/typescript6@^6.0.2"
     }
   }
   ```
5. Parallelism: defaults are fine; on small CI machines prefer fewer checkers (`--checkers 1` or `--singleThreaded` via policy if needed).

## Hard rules

- **[HARD]** Typecheck Logan/P2 sandbox TS with **tsgo**, not only `tsc` 6.
- **[HARD]** Keep eslint/tooling on the **TS 6 API package** until 7.1 API exists.
- **[DEFAULT]** Use existing `run-tsgo.mjs` (respects OpenClaw heavy-check locks).
- **[SITUATIONAL]** Full monorepo `tsgo:all` only when acceptance requires it; prefer focused `tsgo:core` for sandbox work under `src/agents/sandbox/**`.

## Related online skills (general TS, not TS7-specific)

| Skill | URL | Notes |
|-------|-----|--------|
| scalar typescript | https://github.com/scalar/scalar/blob/main/.agents/skills/typescript/SKILL.md | Style / Vue TS |
| mastering-typescript-skill | https://github.com/SpillwaveSolutions/mastering-typescript-skill | TS 5.9+ patterns |
| agentskills.me typescript | https://agentskills.me/skill/typescript | Generic installable skill |
| mcollina/skills | https://github.com/mcollina/skills | Node/Fastify/TS |
| typescript-react-patterns | https://github.com/leejpsd/typescript-react-patterns | Large React skill |

None of the above replace this skill for **TS 7 native / tsgo** in OpenClaw.

## Quick acceptance for TS 7 work

- [ ] Touched TS compiles under `pnpm tsgo:core` (or relevant project)
- [ ] No dependency change that removes TS 6 API for eslint without a migration plan
- [ ] Docs mention `tsgo` for typecheck, not “runtime is TS 7” (Node still runs JS)
