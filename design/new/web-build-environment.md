# Web build environment: yarn install reliability & "ready right off"

Status: 2026-06. Read when touching `.claude/hooks/session-start.sh`,
`scripts/web-setup.sh`, the cloud environment **setup script**, the network
allowlist, or the yarn version. Mirrors the conway change (same root cause).

## TL;DR

1. The Claude-Code-on-web egress **resets — and sometimes silently hangs —
   sustained package-manager connections.** A single fresh request (curl) is
   fine; a long install accumulates dropped sockets.
2. **yarn classic (1.22.22) has no per-request retry**, so it aborts the whole
   run on the first drop (`error Error: aborted`). Diagnosed in detail in the
   conway repo (`design/new/web-build-environment.md` there). It is **not** a DNS
   problem — Node resolves/connects fine.
3. Fix = **yarn Berry, vendored** (`.yarn/releases/yarn-4.9.2.cjs` +
   `.yarnrc.yml`, `httpRetry`), installed via `scripts/web-setup.sh` in a
   `timeout`-guarded resume loop. **No npm fallback** — a failed install fails
   loudly instead of installing a tree that drifts from `yarn.lock`.

## Lifecycle (setup script vs SessionStart hook)

- **Cloud environment setup script** (web UI) — runs once, **snapshotted/cached**
  → set it to `bash scripts/web-setup.sh` so `node_modules` is present right off.
- **SessionStart hook** (`.claude/`) — runs every session; delegates to the same
  `scripts/web-setup.sh`. The install is gated on a hash of `yarn.lock` +
  `package.json`, so it is an instant no-op when deps are unchanged.

The snapshot is invalidated only by a setup-script/network edit or the ~7-day
expiry — never by a repo change — which is exactly why the install gate hashes
the lockfile rather than trusting a bare "node_modules exists" stamp.

## corepack & the lockfile

- corepack can't self-bootstrap Berry in the sandbox (`repo.yarnpkg.com` is
  egress-blocked, 403) — hence the **vendored** binary. `web-setup.sh` also drops
  a `yarn` PATH shim so interactive `yarn` works in a web session.
- The sandbox can't complete the fetch Berry needs to *write* the converted
  lockfile, so the one-shot `.github/workflows/berry-lockfile.yml` generated it
  on a healthy-network runner and committed it back; that workflow is removed
  after the lockfile lands.
- CI activates Berry with `corepack enable` (the runner network is unrestricted).
