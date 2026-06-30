#!/usr/bin/env bash
# Canonical bootstrap for a fresh checkout: install deps (yarn Berry) so
# `yarn lint` / `yarn typecheck` / `yarn test` / `yarn build-prod` work.
#
# Used in two places (keep the logic here, not duplicated):
#   - the Claude Code on the web *environment setup script* (cloud UI), which is
#     snapshotted/cached so node_modules is present right off in every session.
#     Set that field to:   bash scripts/web-setup.sh || true
#     The `|| true` is load-bearing: a non-zero setup script makes the SESSION
#     FAIL TO START, so a transient cold-install failure would lock you out
#     entirely. With `|| true` the session still starts and the SessionStart hook
#     re-runs this script — failing loudly but recoverably, in-session — if the
#     install didn't complete.
#   - the repo SessionStart hook (.claude/hooks/session-start.sh), as a guard for
#     local dev and for a cold cache.
#
# Why Berry + a resume loop (see design/new/web-build-environment.md):
# the Claude-Code-on-web egress resets — and sometimes silently hangs —
# sustained installer connections. yarn classic 1.x has no per-request retry, so
# it aborts the whole run on the first dropped socket (`error Error: aborted`).
# Berry's `httpRetry` recovers from resets; the per-attempt `timeout` below
# clears a hung socket, and Berry's global cache makes each retry resume from
# where the last one stopped. There is deliberately NO npm fallback: npm
# re-resolves without yarn.lock and drifts the tree. If install cannot complete,
# we FAIL LOUDLY rather than install an unfaithful tree.

set -euo pipefail

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO"

log() { printf '[web-setup] %s\n' "$*"; }

YARN_BIN="$REPO/.yarn/releases/yarn-4.9.2.cjs"

if [ ! -f "$YARN_BIN" ]; then
  log "vendored yarn binary missing at $YARN_BIN — repo checkout is incomplete"
  exit 1
fi

STAMP_DIR="$REPO/.claude/.bootstrap"
mkdir -p "$STAMP_DIR"

# Interactive `yarn` in the web sandbox: corepack cannot self-bootstrap here
# (its download host repo.yarnpkg.com is blocked by the egress policy, 403), so
# the global corepack `yarn` shim fails. Drop a PATH shim that execs the vendored
# Berry binary directly, and put it on PATH for the rest of the session via
# CLAUDE_ENV_FILE (set when this runs from the SessionStart hook). This is what
# makes `yarn test` / `yarn build-prod` work in a web session.
SHIM_DIR="$REPO/.yarn/bin"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/yarn" <<SH
#!/usr/bin/env bash
exec node "$YARN_BIN" "\$@"
SH
chmod +x "$SHIM_DIR/yarn"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -q "$SHIM_DIR" "$CLAUDE_ENV_FILE" 2>/dev/null; then
  echo "export PATH=\"$SHIM_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# node_modules — Berry immutable install, retried with a per-attempt timeout that
# resumes from the global cache. Immutable so a lockfile mismatch fails loudly
# (deterministic) instead of silently mutating yarn.lock.
ATTEMPTS="${WEB_SETUP_INSTALL_ATTEMPTS:-6}"
ATTEMPT_TIMEOUT="${WEB_SETUP_INSTALL_TIMEOUT:-180}"
# Gate on a hash of the dependency inputs, NOT a bare stamp. The cloud
# environment snapshot is invalidated only by a setup-script/network edit or the
# ~7-day expiry — never by a repo/lockfile change — so a warm snapshot would
# otherwise serve stale node_modules after a dependency bump. Unchanged inputs =>
# instant no-op every session (like a local `yarn install` that's already up to
# date); a changed yarn.lock/package.json => re-install.
DEP_HASH="$( sha256sum yarn.lock package.json 2>/dev/null | sha256sum | cut -d' ' -f1 )"
INSTALL_STAMP="$STAMP_DIR/node_modules.${DEP_HASH}"
if [ ! -d node_modules ] || [ ! -f "$INSTALL_STAMP" ]; then
  install_ok=false
  install_log="$(mktemp)"
  for attempt in $(seq 1 "$ATTEMPTS"); do
    log "yarn install --immutable (attempt ${attempt}/${ATTEMPTS}, timeout ${ATTEMPT_TIMEOUT}s)"
    if timeout "$ATTEMPT_TIMEOUT" node "$YARN_BIN" install --immutable 2>&1 | tee "$install_log"; then
      install_ok=true
      break
    fi
    # A lockfile/immutable mismatch (YN0028) is deterministic — do not burn
    # retries on it; surface it so the lockfile gets fixed.
    if grep -qiE 'YN0028|would be modified|immutable' "$install_log"; then
      log "yarn.lock is out of sync with package.json (immutable install cannot proceed). Fix the lockfile; not retrying."
      rm -f "$install_log"
      exit 1
    fi
    if [ "${attempt}" -lt "$ATTEMPTS" ]; then
      log "install attempt ${attempt} failed/stalled (egress reset); resuming from cache after backoff"
      sleep $(( attempt * 3 ))
    fi
  done
  rm -f "$install_log"
  if [ "${install_ok}" != true ]; then
    log "yarn install did not complete after ${ATTEMPTS} attempts — FAILING (no npm fallback by design)"
    exit 1
  fi
  # Drop stamps for previous dependency sets, then record the current one.
  rm -f "$STAMP_DIR"/node_modules.* 2>/dev/null || true
  touch "$INSTALL_STAMP"
else
  log "node_modules up to date for current yarn.lock + package.json, skipping install"
fi

log "ready (deps installed)."
