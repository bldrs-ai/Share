# Playbook

This doc describes how to work in the project as a developer and in our team.

## Development Commands

### Build Commands
- `yarn build` / `yarn build-conway` - Main production build using Conway engine
- `yarn build-webifc` - Build using web-ifc instead of Conway
- `yarn build-cosmos` - Build React Cosmos component library documentation
- `yarn build-share-analyze` - Build with bundle analysis enabled
- `yarn clean` - Remove build artifacts in `docs/` directory

### Development Server
- `yarn serve` - Start development server with hot reload (default: Conway, HTTP)
- `yarn serve-https` - Start development server with HTTPS
- `yarn serve-cosmos` - Start React Cosmos component development environment
- Environment variables: `SHARE_CONFIG=dev|prod`, `serveHttps=true|false`

### Testing
- `yarn test` - Run all tests (src and tools)
- `yarn test-src` - Run source code tests with Jest
- `yarn test-tools` - Run build tool tests
- `yarn lint` - Run ESLint and TypeScript type checking
- `yarn typecheck` - Run TypeScript type checking only
- `yarn precommit` - Run lint and test (pre-commit hook)

**Don't `git commit --no-verify` unless you have an active reason.** The
husky pre-commit hook runs `yarn precommit` = eslint + typecheck + jest.
It catches things ad-hoc `yarn jest <file>` won't — cross-file lint
rules, unused imports, `prefer-const` after a refactor, etc. Typical
cost on a quiet machine is lint ~20 s + jest ~90 s.

Legitimate bypass reasons exist (system under memory pressure with
parallel jest workers fighting a dev server; intermediate rebase
commits you'll squash). When you do bypass, run
`yarn lint && yarn jest <changed paths>` as the manual substitute —
**not** just `yarn jest <file>`. AI assistants should make this
substitution explicit (and visible to the user) rather than letting
`--no-verify` quietly calcify into a default.


### Playwright E2E Testing
- `yarn test-flows [spec]` - Run Playwright tests (builds first, starts its own server — no separate setup needed)
- `yarn test-flows [spec] --update-snapshots` - Run and update screenshot snapshots
- `yarn test-flows [spec] -g "test name"` - Run a single test by name grep

**Build config**: Playwright tests use `SHARE_CONFIG=playwright` (`tools/esbuild/vars.playwright.js`).
Key differences from production: `MSW_IS_ENABLED=true`, `NODE_ENV=development`. `OPFS_IS_ENABLED` is
**on**, as in production — it was off until #1779, so treat any older note saying otherwise as stale.
The webServer also sets `SKIP_MARKETING=true`, so the Next.js marketing overlay is not built —
no flow spec loads `/pricing` or `/blog` (they assert `href`s to bldrs.ai). `yarn build` / Netlify
still chain marketing.

**SPA routing**: The static file server (`http-server docs`) has no SPA fallback. Missing paths return
a 404 which serves `docs/404.html`, which redirects to `/?/the/path`. `docs/index.html` then uses
`history.replaceState` to restore the real URL before React mounts.

**Simulating local file opens**: `window.location.assign` is unforgeable in Chrome — overriding it
silently fails and navigation still occurs. To test the "recently opened local file" flow without a
full DnD pipeline:
```ts
await page.evaluate(() => {
  localStorage.setItem('bldrs:recent-files', JSON.stringify({
    version: 1,
    files: [{id: 'model.ifc', source: 'local', name: 'model.ifc', lastModifiedUtc: null}],
  }))
})
```
The `OpenModelDialog` reads `loadRecentFilesBySource('local')` from localStorage whenever the dialog
opens (`isDialogDisplayed` → true), so the entry is visible immediately without a page reload.

**OPFS in tests**: on since #1779, so a spec exercises the same OPFS path as production —
`saveDnDFileToOpfs` runs rather than `saveDnDFileToOpfsFallback`, and the GLB cache round-trip
(writer → OPFS → reader) is reachable at all. That round-trip is what the cache-hit specs guard;
without OPFS they could only ever have tested a live parse.

The flag is compile-time and all-or-nothing (`store/BrowserSlice.js` hard-gates the setter), so it
cannot be enabled per-spec. Four consequences worth knowing:

- **It changes every model-loading spec, not just the cache-hit ones.** `Loader.js#load` gates the
  whole OPFS block on `isOpfsAvailable`, so turning the flag on also turns on, suite-wide: the model
  fetch moving into `OPFS.worker.js` (see "Intercept model fetches" below); a full GLTFExporter +
  gzip + OPFS write scheduled on `requestIdleCallback` at the tail of every load, fire-and-forget and
  often still in flight when the context closes; and `spillModelSource` + `ReleaseModelGeometry`,
  which free Conway's native geometry mid-test. A spec that picks, isolates or screenshots late is
  running against a materially different runtime state than it was written against. If a spec starts
  failing after touching this flag, that is the first place to look.
- Per-test isolation comes from Playwright's fresh `BrowserContext`, not from anything the app does —
  Chromium partitions OPFS per context, and a retry gets a fresh context too. A spec that populates
  the cache and then reloads can still `clearOpfs`, but put it in `beforeEach`: the case it insures
  against is a run interrupted mid-write, which is exactly the case where an `afterEach` never runs.
- Waiting on a `[glb]` console line is the way to observe cache state (`cache HIT`, `writer: wrote`).
  Use `waitForGlbLog` from `src/tests/e2e/glbLogs.ts` and **not** `page.waitForFunction(pred, {logs})`
  — that serialises its argument into the page once, so Node-side pushes never reach the predicate and
  the wait can only succeed if the line already arrived. Two specs sat `fixme`'d on exactly that
  mistake, and a third was written already-`fixme`'d beside them, for five weeks (#1779).
- Wait for `writer: wrote`, never for a `.glb` to appear in OPFS. The file exists from creation, so
  the existence check is satisfied while the artifact is still half-written and the reload then reads
  it as a `cache MISS`.

**Intercept model fetches**: For tests that navigate to a GitHub model URL, use `setupVirtualPathIntercept`
from `src/tests/e2e/models.ts` to serve a fixture file in place of the real network request. Note that
with OPFS on, the model fetch is issued from `OPFS.worker.js`, not the page — so page-level
`context.route` handlers (`setupVirtualPathIntercept`'s own, and `blockExternalNetwork`'s
real-network guard) are not the mechanism keeping it hermetic; MSW's service worker is. Gate
navigation on the service worker being active (`visitHomepageWaitForModel` does; a bare `page.goto`
does not) before assuming a fixture will be served.

**Screenshot goldens**: A new `expectScreen(page, 'Name.png')` test has no baseline, so it fails until
you generate one:
```bash
yarn test-flows src/path/To.spec.ts --update-snapshots -g "test name"
```
The PNG lands in `src/path/To.spec.ts-snapshots/` (see `snapshotPathTemplate` in
`tools/playwright.config.js`) and is committed with the test. Two things to know:

- **Look at the generated golden before committing it.** `--update-snapshots` writes whatever
  rendered, so a broken render becomes the baseline and CI then enforces the bug.
- **Fixtures must live in `src/tests/fixtures/github/...`,** not `docs/__test_fixtures__/`. The
  `test-flows` web server runs `yarn test-flows-build`, which starts with `yarn clean` and then
  copies the fixture tree in — so anything hand-placed under `docs/` is deleted before the run.

Re-running `--update-snapshots` over an existing golden rewrites it, which is how you intentionally
accept a visual change; without the flag, a diff fails the test and the actual/expected/diff PNGs
land in `tools/playwright-report`.


# Specific Guides

## Testing OPFS Worker Code

`OPFS.worker.js` runs in a Web Worker and uses browser-only globals. Tests for it require the
node environment and manual polyfills. See `src/OPFS/OPFS.worker.test.js` for the full setup,
key points:
- Use `/** @jest-environment node */` at the top of the file
- Declare `global.self`, `global.CacheModule`, `global.importScripts` before `require`ing the worker
- Polyfill `File`, `DOMException`, `WritableStream` if needed
- `require('./OPFS.worker.js')` returns the worker's exported functions for direct testing

To simulate the worker sending multiple messages in `utils.test.js`, call the listener multiple
times inside one `process.nextTick`:
```js
const mockWorker = {
  addEventListener: jest.fn((_, handler) => {
    process.nextTick(() => {
      handler({data: {completed: true, event: 'download', file: mockFile}})
      handler({data: {completed: true, event: 'renamed', file: mockFile, lastModifiedGithub: 123}})
    })
  }),
  removeEventListener: jest.fn(),
}
```


## Debugging Silent No-ops in Persistence

`updateRecentFileLastModified(id, ms)` and similar persistence helpers are **silent no-ops** when
no entry matches the `id`. If an update appears not to be working, verify:

1. The entry was created (via `addRecentFileEntry`) before the update runs
2. The `id` at creation and update sites are byte-for-byte identical

For GitHub files the id is the share path built by `navigateBaseOnModelPath`. A common mistake
is passing `filepath` without a leading `/` — this fuses the branch and filename with no separator
and the lookup silently fails. See DESIGN.md for the `filepath` format contract.

## Test Fixture Data Should Match Production Shape

When writing test fixtures for route-derived data (e.g. `modelPath`), use the exact shape that the
production code produces — not a "nicer" variant. The routes layer strips leading slashes from
`filepath` via `splitAroundExtensionRemoveFirstSlash`. A fixture with `filepath: '/model.ifc'`
accidentally passes tests that would fail with the real `filepath: 'model.ifc'`, masking bugs.


## Playwright workers

`tools/playwright.config.js` derives the local webServer port from the
playwright ancestor PID (`tools/get-port-please.js`), so every worker
points at the same server. Local default is 4 workers.

An older scheme probed for a free port on every worker import, which
handed workers 2–N a different port than the server — `ERR_CONNECTION_REFUSED`.
If you still see that, the ancestor lookup failed (the config prints a
warning) and you can fall back to `--workers=1`.

**CI:** Share is public, so `ubuntu-24.04` is 4 vCPU / 16 GB and free.
Each shard still runs `--workers=2` (the density that stayed green on
the old 8 GB larger runner; packing 4 SwiftShader Chromiums onto 4
cores contends). The suite is split `--shard=1/4` … `4/4` so eight
Chromiums run across four free machines. The required check is still
`playwright-run` (an aggregator over the shards). The paid
`ubuntu-24.04-4vcpu-8gb-150gbssd` larger runner is not used here —
larger runners are billed even on public repos.

**Load measurement** (`loadTiming.spec.ts`) still wants `--workers=1` so
the numbers aren't contended — that's isolation, not the port bug. See
[design/new/browser-load-measurement.md](design/new/browser-load-measurement.md).


## Netlify's Lighthouse Best Practices score is flaky — check, don't assume

The preview comment's **Best Practices** number moves between 83, 92 and 100
across audits of unrelated commits, and presents each swing as "down 9 from
production" / "up 8 from production". Twice it cost a real investigation:

- On #1783 it read −9 on a diff of specs, docs and `vars.playwright.js` — none
  of which reach the `SHARE_CONFIG=prod` bundle the audit loads — and later read
  +8 on the same PR with no change in between.
- On #1790 it read −9 on a diff that **does** touch production code. Building
  `main` and the branch side by side under one config and capturing console
  errors on load gave byte-identical results; the score recovered to 92 on the
  next head unaided.

So the score is known-flaky and a delta is not by itself evidence of a
regression. **It is also not by itself evidence of nothing:**

- **If the diff cannot reach the prod bundle** (specs, docs, Playwright-only
  config), a delta is the audit. Nothing to do.
- **If the diff can reach it, open the audit and read which check changed.**
  Best Practices aggregates several — console errors are only one of them, so a
  local console A/B is a useful first cut and *not* a clearance: a production
  change can leave the console identical and still move a legitimate check. The
  Netlify deploy log names the failing audit; that is the artefact to look at,
  and it is what neither investigation above actually managed to read (the
  agent sandbox's proxy blocks `netlify.app`, which is why both fell back to a
  local A/B).

## A git worktree is not a place to commit from, or to check config in

Agents that work in a linked worktree (`.claude/worktrees/…`, gitignored
since #1792) hit two problems that both present as "the repo is broken"
rather than "this checkout is incomplete".

**1. You cannot commit there, and the obvious workaround is the bad one.**
`core.hooksPath = .husky` lives in `.git/config`, which linked worktrees
*share*, so git looks for the hook in the worktree. `.husky/pre-commit` is
tracked, so it is there — but it starts by sourcing `.husky/_/husky.sh`,
which `husky install` generates and which is **untracked**, so it is not.
Verified on a fresh worktree of this repo: the commit aborts with

```
.husky/pre-commit: 2: .: cannot open .husky/_/husky.sh: No such file
```

and exits 1. That failure is at least loud. The danger is what it invites:
`--no-verify` clears it instantly and lands a commit that nothing has
linted, typechecked or tested — the exact gate CLAUDE.md tells you to trust
instead of running by hand. **Don't.** Either `yarn install` in the worktree
(which reinstalls `.husky/_`, and a full `node_modules`), or — cheaper, and
what actually worked here — do the editing in the worktree, export the change,
and `git apply` + `git commit` it in the main checkout, where the hook is
wired. Stage first and ask for binary, or the export quietly loses work:

```sh
# in the worktree
git add -A && git diff --cached --binary > /tmp/x.patch
# in the main checkout
git apply /tmp/x.patch && git commit
```

A plain `git diff` shows tracked modifications only, so a **new** file — a
module, a spec, a fixture — is simply absent from the patch, with no warning;
`--binary` is what carries a changed image or model fixture. Measured on a
scratch worktree: a patch made with plain `git diff` after adding one `.js`
and one `.png` contained **zero** references to either, while the staged form
above carried both and applied cleanly in the main checkout. The failure mode
is the bad kind — the commit looks complete, and the missing work sits in a
worktree that gets deleted.

**2. Anything resolution-sensitive gives the wrong answer there.** A
worktree starts with no `node_modules` at all, so the reflex is to symlink
or copy the main checkout's. Both make the worktree lie about anything that
depends on *where* a module resolves from:

- `singleThreeInstance.test.js` failed in a worktree and passed in the main
  checkout, on identical source — it asserts a single resolved `three`, and
  a symlinked tree gives it two.
- An eslint probe run in a worktree did **not** reproduce the plugin-
  uniqueness error that motivated #1792's `root: true`, because the config
  cascade above the worktree is a different set of directories.

So a worktree is fine for reading and editing. Confirm any result about
module resolution, the eslint/babel config cascade, or the hook in the main
checkout before you believe it — and before you write it into a PR body.


## Drive Picker fails on Brave with Shields up

When testing the Drive Picker on Brave at `bldrs.ai`:

- **Symptom:** clicking Select on a picked file → OS spinny, picker stays
  open, console shows two 401s from `docs.google.com/pick…` with empty
  response body.
- **Root cause:** Brave Shields (default-on) blocks third-party cookies on
  `docs.google.com` even when the OAuth `access_token` URL parameter is
  correct. The picker's confirm-pick endpoint needs the docs.google.com
  session cookie alongside the OAuth token.
- **Fix to test:** click the 🦁 icon in URL bar on bldrs.ai → Shields
  **down** → retry. Chrome works without changes because its 3p-cookie
  default is currently looser than Brave's.

Not to be confused with Brave's popup blocker (separate feature, default-on
in all major browsers) — that one trips on `requestAccessToken({prompt:''})`
outside a user gesture and is handled by the GDrive auth pre-flight
pattern. See [`src/connections/README.md`](src/connections/README.md).


## `gh pr edit` silently drops title/body updates

`gh pr edit <num> --title ... --body ...` warns about Projects (classic)
deprecation and **silently fails the entire mutation** without a non-zero
exit. The PR title/body don't actually update — verifying with
`gh pr view` is the only way to catch it.

Root cause: the underlying GraphQL `updatePullRequest` mutation pulls
`repository.pullRequest.projectCards`, a field GitHub is sunsetting. The
whole call rejects.

Use the REST API directly:

```bash
# Title only
gh api -X PATCH /repos/<owner>/<repo>/pulls/<num> -f title='...'

# Body — large bodies via --input
jq -Rs '{body: .}' < /tmp/body.md > /tmp/body.json
gh api -X PATCH /repos/<owner>/<repo>/pulls/<num> --input /tmp/body.json
```

Verify with `gh pr view <num> --json title,bodyText`. Once GitHub removes
the classic Projects GraphQL field, regular `gh pr edit` will work again.


## Git network operations need generous timeouts

Use `timeout: 120000` (120 s) or higher for any `git push`, `git pull`,
`git fetch`, or `git clone` invocation. A 30 s timeout can kill the
process mid-run and return partial/garbage output that **looks like
success** — e.g. an aborted push has been observed to produce a bogus
remote URL string that downstream parsers misread as the destination
remote.

After a push, verify with `git log origin/<branch>` or `git status` rather
than trusting the push command's output alone.


## Keep the test console clean

**A test run should print nothing unexpected.** Noise isn't cosmetic: once a
run logs a hundred lines of warnings, the one *new* warning that flags a real
regression drowns in them and nobody sees it. So a green run is also a *quiet*
run — treat a stray warning as a defect to resolve, not scenery. There are
four moves, in priority order; reach for a lower one only when the one above
it genuinely can't apply.

**1. Fix the warning at the source.** Most React `act()` warnings mean a state
update wasn't awaited. Await it — don't mute it. `actAsyncFlush()`
(`src/utils/tests.js`) settles the pending microtask after a render:

```js
import {actAsyncFlush} from '../utils/tests'
render(<Thing/>)
await actAsyncFlush() // flush the mount effect's setState before asserting
```

Keep that helper **timer-agnostic** — a single awaited `Promise.resolve()`,
never a `setTimeout(0)`. Under `jest.useFakeTimers()` a real timer never fires
unless the clock is advanced, so a `setTimeout`-based flush would hang every
caller that uses fake timers. Same rule for any flush helper you add.

**2. Divert expected diagnostics into a buffer and assert on them.** When code
is *supposed* to log — the `[glb]` loader emits error-path diagnostics by
design — don't let it reach the console and don't silently swallow it either.
Route it through a swappable sink and assert the expected line is present, so
the diagnostic becomes a *tested signal* instead of spam:

- `src/utils/logSink.js` — the mechanism. `createLogChannel(prefix, sinkKey)`
  returns `{emit, setSink}`: `emit` writes `<prefix> <args>` to the console
  until a sink is installed. The sink lives on `globalThis` (under `sinkKey`)
  so it survives `jest.resetModules()`.
- `src/loader/glbLog.js` — the `[glb]` emit side. `glbInfo/glbWarn/glbVerbose`
  emit on that channel; tests swap the sink via `setGlbLogSink`.
  `src/viewer/ifc/conwayDirectLog.js` is the same for the `[conwayDirect]` IFC
  parse summary and parse-failure error.
- `tools/jest/logCapture.js` + its per-channel wrappers
  (`glbLogCapture.js`, `conwayDirectLogCapture.js`) — the test side.
  `installGlbLogCapture()` / `installConwayDirectLogCapture()` (wired once in
  `setupTests.js`, cleared per test) buffer everything; a spec reads a buffer
  with `getGlbLogs()` / `getConwayDirectLogs()`:

```js
import {getGlbLogs} from '../../tools/jest/glbLogCapture'
// ...trigger the malformed-GLB path...
expect(getGlbLogs().some((l) => l.text.includes('out-of-range bufferView 99')))
  .toBe(true)
```

Pin values, not presence: `Loader.test.js` asserts the whole
`parsed modelID=0 — vertices=3 triangles=1 …` text, so a regression that
silently drops geometry fails the test — `some(l => l.text.includes('parsed'))`
would not have.

Apply this pattern to any subsystem with intentional, assertable logging:
build it a channel with `createLogChannel` rather than calling `console.*`
directly.

**3. Suppress only what you genuinely can't reach — narrowly, and restore it.**
Some updates fire outside any `act` scope RTL can enclose: a mocked model load
that resolves on its own timers and drives a `setState` *during* a `waitFor`.
There's nothing to await. `suppressActWarnings()` (`src/utils/tests.js`)
swallows **only** the `"not wrapped in act"` line and passes every other
`console.error` through. Scope it to the one test and wrap in `try/finally` so
a failed assertion can't leave `console.error` mocked for the rest of the file
(which would hide every later test's real errors):

```js
const restore = suppressActWarnings()
try {
  // ...the one test whose cascade can't be awaited...
} finally {
  restore()
}
```

This is the escape hatch, not the norm — prefer move 1 whenever the update is
reachable.

**4. If you mute a real signal globally, back it with a static test.** A global
`console.warn` filter is a blunt instrument: it can hide a genuine problem
alongside the false positive. `setupTests.js` mutes three's *"Multiple
instances of Three.js"* warning because under jest it's a false positive (the
harness resets the module registry and re-imports three against an already-set
`window.__THREE__`). But that same warning would also fire for a *real* on-disk
duplicate — a nested `node_modules/three` pulled in by some dependency's
version range — which the filter would now swallow. So the mute is paired with
`src/viewer/three/singleThreeInstance.test.js`, a static scan that fails if
`three` appears in `node_modules` more than once. **Rule:** any global console
filter that could mask a real defect needs a compensating detector for the case
that actually ships.

**Bonus — kill jsdom "not implemented" spam at the setup seam.** jsdom logs a
`console.error` every time app code calls an unimplemented canvas method
(`getContext`, `toDataURL` — PerfMonitor's overlay, screenshot capture). The
code already treats their falsy return as "headless — skip", so
`setupTests.js` stubs them to exactly those falsy values. Same runtime the code
already saw under jsdom, minus the per-call error. A test needing a real
context still overrides these on its own canvas object.

The shared wiring lives in **`tools/jest/setupTests.js`** (glb capture install
+ per-test clear, the three filter, the canvas stubs); per-test helpers live in
**`src/utils/tests.js`**.
