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
Key differences from production: `OPFS_IS_ENABLED=false`, `MSW_IS_ENABLED=true`, `NODE_ENV=development`.

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

**OPFS in tests**: With `OPFS_IS_ENABLED=false`, `saveDnDFileToOpfs` is never called; the fallback
(`saveDnDFileToOpfsFallback`) runs instead and produces a UUID without an extension. This makes
post-DnD navigation unreliable in tests — prefer testing the persistence→UI layer directly (see above).

**Intercept model fetches**: For tests that navigate to a GitHub model URL, use `setupVirtualPathIntercept`
from `src/tests/e2e/models.ts` to serve a fixture file in place of the real network request.


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


## Playwright locally needs `--workers=1`

`tools/playwright.config.js` computes the dev-server port at import time:

```js
const port = isCI ? ciPort : runGetPortPlease(ciPort)
```

Each Playwright worker re-imports the config, so each calls
`runGetPortPlease` independently and lands on a different random port.
The webServer started on the FIRST port; workers 2-N point at non-listening
ports → `net::ERR_CONNECTION_REFUSED`. Tests look "broken" when they're not.

- **Local:** `yarn test-flows --workers=1 [spec]`.
- **CI:** works fine with parallelism — `isCI` short-circuits to fixed
  port `9081`, all workers point there.

Pre-existing quirk; flag as a separate cleanup if it bothers you.


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
