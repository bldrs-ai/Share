# Toolchain: Node 26 and Bun (2026-11-11)

An evaluation, then what was adopted from it: Bun installs (isolated
linker), Node stays the runtime, Node 26 waits for Lambda. The adoption
and everything it changed is §"What was adopted"; the measurements that
led there are §Results.

Measured on one cloud sandbox (4 vCPU, 15 GB), each step run alone so
nothing else competed for the cores. One run per cell, so treat
differences under ~10% as noise — a repeated eslint run on the same
runtime landed 62–74 s.

Versions: Node **24.22.2** (what CI and Netlify pin today), Node
**26.13.0** (latest; Active LTS "Lithium" since 2026-10-28), Bun
**1.4.4** (latest stable).

## Results

### Runtime: which program runs eslint / tsc / Jest / esbuild

Same `node_modules` (yarn's hoisted tree, before the switch), same
commands as `precommit` / `build-prod`. Bun is `bun --bun <script>` (forces Bun's runtime even
where a script's shebang says `node`).

| Step | Node 24 | Node 26 | Bun 1.4.4 |
|---|---:|---:|---:|
| `eslint src netlify tools --max-warnings 0` | 83.7 s | 73.5 s | 74.5 s |
| `tsc` (typecheck) | 6.0 s | 5.1 s | 5.0 s |
| Jest, `jest-tools.config.js` (18 suites, 296 tests) | 19.9 s | 15.0 s | **fails: 0/18 suites load** |
| Jest, `jest.config.js` (424 suites, 6052 tests) | 282.4 s | 260.7 s | **fails: 0/424 suites load** |
| esbuild prod build (`tools/esbuild/build.js`) | 5.8 s | 4.1 s | 4.0 s (output byte-identical to Node's) |

- **Node 26** passes everything and is faster on every step (eslint −12%,
  jest −8%, jest-tools −25%, build −30%). No new runtime warnings; the
  only warning on either version is the `--experimental-vm-modules` one
  `test-tools` already prints.
- **Bun as a runtime** gives no gain where it works (eslint, tsc and the
  esbuild bundle are all native or V8/JSC-equivalent work), and Jest does
  not run on it at all: `jest-environment-node` redefines globals on a
  `vm` context and Bun's `vm` rejects it (`TypeError: Attempting to
  change access mechanism for an unconfigurable property`); under
  `jest.config.js` the transformed modules additionally see `require is
  not defined`. That's a Jest-on-Bun gap, not something this repo can fix.

### Bun's own test runner (`bun test`)

`bun test` doesn't read `jest.config.js`, so the probe supplied what the
config does via `--preload`: jsdom globals in place of `testEnvironment`,
`Bun.plugin` loaders in place of the `.css` / `.svg` / `.md` transforms,
then `setupNodeFetch.cjs` + `setupTests.js`.

- 3129 of 6052 tests pass (52%); 196 of 424 files are fully green. The
  run takes ~60 s, but with half the suite failing that's no basis for
  a speed comparison.
- The failures are Jest APIs Bun doesn't implement, not setup:
  `jest.requireActual` (used in 47 test files), `jest.resetModules` /
  `isolateModules` (10), `spyOn` on accessor properties, and `jest.mock`
  factory semantics (139 files use `jest.mock`). It also collects
  Playwright `*.spec.ts` files by default.
- Verdict: a port would mean rewriting a third of the suite's mocking
  onto `mock.module`, and the result would test under JSC while users
  run V8/SpiderMonkey/JSC. Not worth it now; re-probe when Bun
  ships `requireActual` / `resetModules`.

### Package install: `bun install` vs `yarn install`

Both from the committed `yarn.lock`, fresh directory, Node 26 on PATH.

| | Cold cache | Warm cache |
|---|---:|---:|
| `yarn install --frozen-lockfile` | 146.1 s | 77.6 s |
| `bun install --frozen-lockfile` | **21.5 s** | **2.8 s** |

- **Same versions.** Both trees hold the same 2366 `name@version`s; yarn
  also fetches three musl-libc binaries (sharp, @parcel/watcher) that
  Bun correctly skips on glibc.
- **`yarn.lock` can stay the only lockfile.** With `--frozen-lockfile`
  and no `bun.lock` present, Bun installs from `yarn.lock` and writes
  nothing. It also catches drift: editing a `package.json` range
  without updating `yarn.lock` fails with `lockfile had changes, but
  lockfile is frozen`. (Without `--frozen-lockfile` it writes a
  `bun.lock`. That option — Bun in CI over a yarn.lock — was dropped in
  favour of switching outright: two installers would put CI and Netlify on
  different trees, as the bundle difference below shows.)
- **Lifecycle scripts:** Bun blocks scripts of packages not on its
  trust list. Here that's `core-js-pure` (a donation banner) and
  `@parcel/watcher` (a build-from-source fallback; the prebuilt binary
  is present). `esbuild`, `msw` (writes `public/mockServiceWorker.js`),
  `sharp` and `netlify-cli` ran. Root `prepare` (`husky install`) runs.
- **The full gate passes on Bun's tree** (Node 26 runtime): eslint, tsc,
  both Jest configs (424/424, 18/18) and the prod build.

**But the prod bundle differs.** Bun's hoisting differs from yarn's.
For `es-abstract`, yarn puts 1.24.0 at the top and nests three copies of
1.20.1; Bun puts 1.20.1 at the top and nests **eighteen** copies of
1.24.0 (plus 22 of `object-inspect`) under the `airbnb-js-shims`
polyfills (`array.prototype.flat`, `object.fromentries`,
`string.prototype.matchall`, …). esbuild bundles each physical copy, so
`docs/index.js` grows **15.74 MB → 16.24 MB (+0.5 MB, +3%)**, and those
modules are evaluated more than once at startup. Found by diffing the
two builds' esbuild metafiles (`ANALYZE=true`).

`bun install --linker isolated` (one directory per `name@version`,
pnpm-style) would remove the duplication, but the build then fails on
two **phantom dependencies** — packages imported from `src` but not
declared in `package.json`, which resolve today only because hoisting
happens to put them at the top:

- `react-router` — `src/Components/Properties/PropertiesPanel.jsx`,
  `src/Share.fixture.jsx` (comes in via `react-router-dom`)
- `@mui/system` — `src/Components/Versions/VersionsTimeline.jsx`
  (comes in via `@mui/material`)

These are latent bugs under any installer: a dependency bump that
changes hoisting can break the build. Declaring both (at the versions
already in `yarn.lock`) fixes it.

## What was adopted (2026-11-11)

Bun installs; Node is still the runtime for everything; Jest is unchanged.

**Installs: `bun install`, isolated linker, `bun.lock`.** `yarn.lock` is
gone, from the root and from `marketing/`. Both lockfiles were migrated
from it, so they hold the same versions: 2459 and 538 entries, no
differences once npm aliases are counted under their real names.
`bunfig.toml` (and `marketing/bunfig.toml`, since Bun reads the one in
the directory it installs) sets `linker = "isolated"` and `exact = true`.
`package.json`'s `packageManager` is `bun@1.4.4`. A `preinstall` guard,
`tools/requireBun.mjs`, makes `npm install` / `yarn install` fail loudly
instead of laying out a hoisted tree from a stale resolution. Scripts call
each other with `bun run`; `bun run` executes them with the `node` on
PATH, so nothing runs under Bun's runtime. Bun is pinned to the same
version in three places: `packageManager`, `netlify.toml`'s `BUN_VERSION`
(plus `BUN_FLAGS = "--frozen-lockfile"`), and the `bun-version` of each
workflow's `setup-bun` step.

**Undeclared imports the isolated tree surfaced** — each was resolvable
only because hoisting happened to put it at the top, and each is now
declared at the version the lockfile already resolved:

| Package | Imported by | Came in via |
|---|---|---|
| `react-router` 6.3.0 | `PropertiesPanel.jsx`, `Share.fixture.jsx` | `react-router-dom` |
| `@mui/system` 5.16.8 | `VersionsTimeline.jsx` | `@mui/material` |
| `regenerator-runtime` 0.13.11 (dev) | `tools/jest/setupTests.js` | `@babel/runtime` |
| `@types/testing-library__jest-dom` 5.14.5 (dev) | `tsconfig.json` `types` | `@testing-library/jest-dom` |
| `@auth0/auth0-spa-js` 2.0.2 (dev) | `src/Auth0/mockLogout.test.js` | `@auth0/auth0-react` |
| `@netlify/config` 24.5.0 (dev) | `tools/netlify/bundleFunctions.mjs` | `netlify-cli` |
| `@netlify/zip-it-and-ship-it` 14.5.4 (dev) | `tools/netlify/bundleFunctions.mjs` | `netlify-cli` |

**Two layout assumptions changed with the tree:**

- Jest's `transformIgnorePatterns` matched a hoisted path
  (`/node_modules/(?!three|…/)`). Jest sees real paths, now
  `node_modules/.bun/<name>@<version>/node_modules/<name>/…`, where the
  first `/node_modules/` is followed by `.bun/` — so every ESM package it
  exists to transform was skipped (346 suites failed to parse).
  `tools/jest/common.js#transformIgnoreNodeModules` lets the lookahead
  pass `.bun/`, which moves the decision to the inner segment.
- `singleThreeInstance.test.js` expected the literal path
  `node_modules/three`. It now resolves every `three` entry (directory or
  link) to its real directory and expects exactly one.

**Bundle:** `docs/index.js` is 15.60 MB, against 15.74 MB from yarn's
tree and 16.24 MB from Bun's hoisted one; es-abstract is in it once.
Packages still bundled at two or more versions (`@babel/runtime`,
`react-is`, the `@emotion/*` set, `get-intrinsic`, …) are ones whose
dependents ask for different ranges. Deduping them is separate work.

**CI:**

- `main.yml` `build`, `test-flows.yml` `playwright-build` and
  `live-smoke.yml` install with `setup-bun` + `bun install
  --frozen-lockfile`. setup-bun is the one third-party action and is
  pinned by commit SHA. `playwright-build`'s install took 1 m 43 s with
  yarn's cache, which setup-node no longer restores; a cold Bun install
  measured 18–22 s here.
- **"Node 20" in the Playwright logs** came from the *actions*, not the
  tests. GitHub's annotation: `actions/checkout@v4`,
  `download-artifact@v4` and `upload-artifact@v4` target the deprecated
  node20 action runtime and are force-run on 24. All four first-party
  actions moved to their current node24 majors — checkout v7, setup-node
  v7, upload-artifact v7, download-artifact v8 — and these workflows don't
  touch any of their breaking changes: checkout v7 refuses fork code only
  under `pull_request_target` / `workflow_run`, which no workflow here
  uses; setup-node v6/v7 change npm auto-caching and `NODE_AUTH_TOKEN`,
  and nothing here sets `registry-url`; the artifact actions only add
  inputs.
- **What the shards actually ran was Node 22.** The
  `mcr.microsoft.com/playwright:v1.56.1-noble` image installs nodesource
  `node_22.x` (Playwright's `utils/docker/Dockerfile.noble`), and the
  shards used it for the test runner, its npm install and
  `tools/playwrightShards.mjs`. A `setup-node` 24 step in the shard job
  now puts 24 first on PATH. The browsers are still the image's, so
  screenshot baselines are unaffected.

**Not adopted:**

1. **Node 26** — still waiting on Lambda. `netlify.toml`'s
   `NODE_VERSION` also picks the Netlify Functions Lambda runtime
   (`tools/netlify/bundleFunctions.mjs`), and `nodejs26.x` is a
   [public preview](https://aws.amazon.com/blogs/compute/introducing-public-preview-runtimes-on-aws-lambda-starting-with-node-js-26-and-python-3-15/)
   (GA indicated for November 2026). Until then Netlify runs functions on
   24, and CI on 26 would test something other than what ships. At GA,
   bump `.nvmrc`, `netlify.toml` and the workflows' `node-version`
   together.
2. **Bun as runtime or test runner** — see Results; Jest stays on Node.

## Reproducing

Node tarballs from `https://nodejs.org/dist/<v>/node-<v>-linux-x64.tar.xz`
unpacked anywhere; Bun from `bun.sh`. For each runtime `R` (`/path/to/node`
or `bun --bun`), from the repo root:

```bash
R node_modules/eslint/bin/eslint.js src netlify tools --max-warnings 0
R node_modules/typescript/bin/tsc
NO_LOG=true R --experimental-vm-modules node_modules/jest/bin/jest.js --config tools/jest/jest-tools.config.js
R node_modules/jest/bin/jest.js --config tools/jest/jest.config.js
SHARE_CONFIG=prod R tools/esbuild/build.js
```

The `tsc` line is what `typecheck` runs, under the chosen runtime
(tsconfig sets `noEmit`). The build doesn't touch `package.json`; through
`bun run build-prod` instead, `git checkout -- package.json` afterwards
(see CLAUDE.md, #1747). For install, the yarn side needs the pre-switch
`package.json` + `yarn.lock` from git history (`git show <rev>:yarn.lock`;
any commit before the Bun switch), copied into an empty directory with
`tools/requireBun.mjs` left behind; time each installer with an empty
cache (`YARN_CACHE_FOLDER=…` / `BUN_INSTALL_CACHE_DIR=…`). To compare bundles,
build with `ANALYZE=true` and diff `outputs['docs/index.js'].inputs` of
`tools/esbuild/bundle-analysis.json`, grouped by `node_modules/` path.
