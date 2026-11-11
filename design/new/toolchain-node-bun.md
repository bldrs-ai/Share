# Toolchain evaluation: Node 26 and Bun (2026-11-11)

Measured on one cloud sandbox (4 vCPU, 15 GB), each step run alone so
nothing else competed for the cores. One run per cell, so treat
differences under ~10% as noise — a repeated eslint run on the same
runtime landed 62–74 s.

Versions: Node **24.22.2** (what CI and Netlify pin today), Node
**26.13.0** (latest; Active LTS "Lithium" since 2026-10-28), Bun
**1.4.4** (latest stable).

## Results

### Runtime: which program runs eslint / tsc / Jest / esbuild

Same `node_modules`, same commands as `yarn precommit` / `yarn
build-prod`. Bun is `bun --bun <script>` (forces Bun's runtime even
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
  `bun.lock` — don't commit one unless the switch is wholesale.)
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

## Recommendations

1. **Node 26: wait for Lambda GA, then bump everything together.**
   `netlify.toml`'s `NODE_VERSION` isn't only the build runtime —
   `tools/netlify/bundleFunctions.mjs` shows zip-it-and-ship-it uses it
   to pick the Netlify Functions Lambda runtime. As of this writing
   AWS's `nodejs26.x` is still a [public
   preview](https://aws.amazon.com/blogs/compute/introducing-public-preview-runtimes-on-aws-lambda-starting-with-node-js-26-and-python-3-15/)
   (GA indicated for November 2026). Netlify then falls back to Node 24
   for functions, so bumping now would have CI test 26 while functions
   ship on 24 — exactly the drift `netlify.toml`'s comment exists to
   prevent. Once Lambda GA lands, bump `.nvmrc`, `netlify.toml` and the
   four workflows' `node-version` in one PR; nothing in the repo needs
   to change for it.
2. **Bun for install only, and only after fixing the hoisting
   difference.** It's the one place Bun wins, and by a lot: about
   2 minutes off each cold CI install (`main.yml` `build`,
   `test-flows.yml` `playwright-build`). Before switching:
   - declare `react-router` and `@mui/system` (the phantom deps above);
   - dedupe `es-abstract` (a `resolutions` pin to 1.24.0, or checking
     whether `airbnb-js-shims` is still needed — its polyfills are what
     pull in the copies), and re-check the metafile on both installers;
   - switch **Netlify and CI together**, or CI's `build-prod` checks a
     different tree from the one that ships. Netlify picks the package
     manager from the lockfile it finds, so this probably means committing
     `bun.lock` and retiring `yarn.lock`, plus `packageManager`, the
     husky hook (`yarn precommit`) and the `yarn …` calls inside
     package scripts — a real migration, not a CI one-liner.
3. **Keep Jest on Node.** Neither Bun's runtime nor `bun test` can run
   the suite as-is (above).

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

The build doesn't touch `package.json`. If you go through
`yarn build-prod` instead, `git checkout -- package.json` afterwards
(see CLAUDE.md, #1747). For install, copy `package.json` + `yarn.lock`
into an empty directory and time each installer with an empty cache
(`YARN_CACHE_FOLDER=…` / `BUN_INSTALL_CACHE_DIR=…`). To compare bundles,
build with `ANALYZE=true` and diff `outputs['docs/index.js'].inputs` of
`tools/esbuild/bundle-analysis.json`, grouped by `node_modules/` path.
