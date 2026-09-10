# GLB Export as a Pro feature — design

Status: v0.1 (2026-09-10). Epic `share-140` (tracking issue linked from the
epic row in [roadmap.md](../roadmap.md) §3.1 once filed).
Owner: Pablo (with Claude).

Share already converts every IFC/STEP it opens into a GLB and parks it in
OPFS as the next-load cache (design/new/glb-model-sharing.md). This doc is
the plan for handing that GLB to the user as a **download**, sold as a Pro
feature: what the artifact is and what has to happen to it before it leaves
the browser, how the export code is delivered *only* to subscribed users,
how a user sees what they have exported, and what each further format (OBJ,
STL, USD, …) would need.

Sections 1–3 are the investigation; §4–§6 the design; §7 the stages that
become the epic's sub-issues; §8 the cross-browser smoke checklist.


## 1. What we already have

### 1.1 The artifact

`src/loader/glbExport.js#exportAndCacheGlb` runs post-parse (idle-scheduled
from `Loader.js`) for every IFC/STEP source and writes **one** OPFS file at
the key `src/loader/glbCacheKey.js#glbCacheKey` derives from the source
(`<ns1>/<ns2>/<ns3>/<file>.<schemaVer>.glb` + commit hash). Per-source-kind
adapters in `src/loader/sourceCacheKey.js` produce the key input for GitHub,
local, upload, Drive and external sources. The file is not a bare GLB: it is
the **Bldrs container** (`src/loader/glbContainer.js`) — a 16-byte header
(`BLDR`, version, chunkCount, compression-mode byte) followed by exactly one
chunk (the writer always packs a single chunk, `packGlbChunks([bytes])`), and
the chunk *is* a valid standalone GLB. So the export is, at the byte level,
`unpackGlbContainer(bytes).chunks[0]`.

What that GLB carries depends on the render path that produced it (all
default-on today):

| Layout | Slot (`schemaVer`) | Geometry encoding | Bldrs data |
|---|---|---|---|
| Batched-native (`glbBatched`, default) | `0.21.0-batched` | `EXT_mesh_gpu_instancing` + `BLDRS_instance_tables` | `BLDRS_spatial_tree`, `BLDRS_element_properties`, `scenes[0].extras` (title, coordination frame) |
| Merged bake (fallback when the batched export declines) | `0.21.0` (or `-draco` / `-meshopt`) | one merged mesh, colour-binned materials, per-vertex `_EXPRESSID` / `_INSTANCEID` | + `BLDRS_face_ids` |

All Bldrs extensions are listed in `extensionsUsed` only (never
`extensionsRequired`), so any glTF reader loads the geometry and ignores the
rest. `KHR_draco_mesh_compression` / `EXT_meshopt_compression` appear only
when the corresponding flag is on (both off by default).

Two properties of the artifact matter for a download:

- **It is not what a third-party viewer shows Share showing.** Source colours
  are exported verbatim and the auto-colour palette is re-derived on read
  (view-140 S1, #1706), so Blender/three.js viewers render the authored
  colours — for a colourless STEP that means grey, not Share's palette.
  Acceptable; document it in the export UI's help text.
- **`BLDRS_element_properties` is the whole pset closure of the model.** The
  originator's own model, so no leak *to us* — but a user exporting to hand
  the GLB onward may not want vendor psets travelling with it. The export
  therefore offers a "strip Bldrs metadata" option (§4.3).

### 1.2 Where a download can be located from

The UI does not hold the cache key. `Loader.js` computes `cacheKeyArgs` from
the source (`gitHubCacheKey` / `localCacheKey` / …) and keeps it in a local
`glbExportContext`; nothing publishes it to the store. The store has
`isCacheWriteInFlight` (true while the writer runs) and `loadedFileInfo`
(`{source, info}`), neither of which identifies the OPFS file. **S2 adds a
`glbArtifact` store slot** `{cacheKeyArgs, schemaVer, writtenAt}` that the
writer sets after `writeGlbBytesToOPFS` resolves and `Loader.js` clears on
every new load — the single hand-off from the loader to the export UI. A
cache-hit load (no writer runs) sets the same slot from the reader
(`tryLoadCachedGlb`), since the artifact it just read is the export.

Both producers can outlive their load — the writer is idle-scheduled and
fire-and-forget, the reader awaits OPFS — so an SPA navigation to a second
model would otherwise let model A's writer republish over model B's cleared
slot, and "Download GLB" on B hands out A. `src/loader/glbArtifactPublish.js`
guards it: `load()` takes a monotonic generation at its start, passes it to
both producers, and `publishGlbArtifact` drops a publish whose generation is
no longer current. A NESTED load — the recursive `load()` `BLDLoader.parse`
runs per object of a `.bld` assembly — takes no generation at all and
publishes nothing (`isNestedLoad` → `NESTED_LOAD_GENERATION`): its cache still
warms per object, but the assembly on screen has no artifact of its own, and
without this each child cleared the slot and then published its own file, so
Download GLB on a two-object scene handed out whichever object loaded last
(#1833). A `.bld` therefore ends with `glbArtifact === null` and the Export
button disabled — its "Preparing GLB…" label overstates a wait that will
never end, which telling "no artifact yet" from "no artifact ever" would
fix.

Reading it back is `readModelByPathFromOPFS(key.originalFilePath,
key.commitHash, key.owner, key.repo, key.branch)` — the reader's own call.

### 1.3 Subscription plumbing

- **Server truth:** Stripe → `netlify/functions/stripe-webhook.js` →
  Auth0 `app_metadata.subscriptionStatus = 'sharePro'` (+ `stripeCustomerId`).
- **Client:** the JWT carries `https://bldrs.ai/app_metadata`; `BaseRoutes`
  decodes it into `store.appMetadata`. `src/quota/quota.js#getTier` is the
  tier mapping (`'sharePro'` → PAID); `GitHubFileBrowser` also treats
  `'shareProPendingReauth'` as Pro.
- **Server-side gate precedent:** `netlify/functions/record-load.js`
  (Bearer → `/userinfo` → Management API → `app_metadata`), with the shared
  `_lib/auth0.js#verifyAuth0Bearer` helper. `create-portal-session.js` is
  the "never trust a client-supplied identity" precedent (#1489).
- **Upgrade path:** `ProfileControl#onSubscriptionClick` — portal if
  `stripeCustomerId`, else `/subscribe/?theme=…&userEmail=…`.
- **Tests:** Playwright mocks Auth0 (`tests/e2e/utils.ts#setupAuthenticationIntercepts`)
  and sets tier through `window.store.setAppMetadata`
  (`Profile/Subscription.spec.ts`); MSW (`src/__mocks__/api-handlers.js`)
  mocks the Netlify functions and reads the tier off the store the same way.
  **Neither environment runs real Netlify functions** — the Playwright build
  is served by `http-server` — so every new function needs an MSW handler
  (dev + jest) and a `page.route` (Playwright).

### 1.4 The build

`tools/esbuild/common.js` is `format: 'esm', splitting: false` (pinned by
`esbuild.test.js`) with two page entries (`src/index.jsx`,
`src/subscribe/index.jsx`) and two workers, each built as its own
`esbuild.build` call in `build.js`. Everything under `docs/` is published
by Netlify. There is no CSP, so `blob:` module imports are allowed; the
page is served COOP `same-origin-allow-popups` without COEP.


## 2. Goals / non-goals

**Goals**

1. A Pro user downloads the current model as a valid, standalone `.glb`
   in one click, from the artifact Share already built — no re-parse.
2. Non-subscribers see the affordance and are routed to upgrade; they
   **never receive the export code**, and the server, not the client, is
   the authority on who does (same principle as quotas).
3. A user can see what they exported (what, when, which format, how big)
   and re-download from the local cache when it is still there.
4. The design extends to other formats by adding a module, not a
   redesign — §6's matrix says what each format can carry.

**Non-goals (this epic)**

- Server-side conversion or server-hosted artifacts. Exports are produced
  and downloaded in the originator's browser; the server sees metadata only.
- DRM. A subscriber can save the module they were served; the hardening
  target is that it is never *published* and never reaches a non-subscriber.
- Exporting from formats that never produce an artifact (OBJ, FBX, PDB, …
  load directly into three). Those are "export from the live scene" — §6.


## 3. Options considered for the gated delivery

| Option | Mechanism | Verdict |
|---|---|---|
| A. Flag in the public bundle | Ship the export code to everyone; hide the button for free users | Rejected — the code is public; "premium" is a `data-testid` away. This is what the UI-only gates in `GitHubFileBrowser` do today and it is fine for *nudges*, not for the thing being sold. |
| B. esbuild `splitting: true` + dynamic `import()` | The chunk is still a public static file under `docs/` | Rejected for the same reason; splitting also changes the whole bundle layout (pinned off in `esbuild.test.js`) for no gating benefit. |
| C. **Separate entry built outside `docs/`, served by an authenticated Netlify function** | Build the pro module as its own bundle into `netlify/functions/_pro-modules/`; `pro-module.js` verifies the bearer token and `app_metadata.subscriptionStatus` on **every** request and streams the JS with `Cache-Control: private, no-store`; the client fetches with the token, wraps the text in a `blob:` URL and `import()`s it | **Chosen.** Reuses the existing gate helpers, no public copy of the code exists, and the only new moving part is a ~60-line function plus a build target. |
| D. Server-side export | Upload the artifact, convert, return a file | Rejected here (a non-goal: the model never has to leave the browser) but the option stays open for formats that need native tooling (USD). |

Why `blob:` + `import()` rather than `import(url)` straight from the
function: a dynamic import can't carry an `Authorization` header, and putting
the token in a query string logs it. The fetch carries the header; the module
text is then imported from a same-origin `blob:` URL (revoked right after)
and never touches OPFS, localStorage or the HTTP cache.


## 4. Design

### 4.1 Module layout

```
src/export/
  proModuleLoader.js     host: loadProModule(name, getToken) → module namespace (blob import), memoised per page
  exportRegistry.js      host: EXPORT_FORMATS matrix (id, label, ext, mime, moduleName, status)
  exportHistory.js       host: OPFS mirror `exports.json` + subscribeToExports (S3)
  useExport.js           host: hook: locate artifact → load module → run → download → record
  pro/
    glbExport.entry.js   PRO MODULE entry (built separately; never bundled into index.js)
    glbExport.js         the export itself: container unpack, optional strip, Blob
src/Components/                    (as built: the components live with their menus,
  Open/ExportSection.jsx            not with the export lib)
                         host: the UI on the Save dialog's Export tab (button, gating, options)
  Open/ExportsList.jsx   host: "My Exports" list (S3), inline under the button (S2b)
  GatedAction.jsx        host: the shared "looks disabled, explains itself" wrapper (S2b)
netlify/functions/
  pro-module.js          GET ?name=<id> — Auth0 bearer + Pro check → JS bytes, no-store
  record-export.js       POST {key, format, title, bytes} → app_metadata.exports (S3)
  _pro-modules/          BUILD OUTPUT (gitignored): glbExport.js
  _tests/                jest suites for the two functions (§4.2: a top-level
                         .js here would deploy AS a function)
```

The host bundle must never import anything under `src/export/pro/`. An
eslint `no-restricted-imports` rule pins it (S1), so a future refactor can't
quietly pull the module back into the public bundle.

### 4.2 Build

`tools/esbuild/build.js` gains a `proModuleBuilds()` alongside the worker
builds: one `esbuild.build` per entry under `src/export/pro/*.entry.js`,
`format: 'esm'`, `bundle: true`, `minify: true`, **`sourcemap: false`**
(no source leak), `outfile: netlify/functions/_pro-modules/<name>.js`.
`netlify.toml` declares `[functions."pro-module"] included_files =
["netlify/functions/_pro-modules/*.js"]` so the bundler ships the files with
the function. The pro entry may import shared *source* (`glbContainer.js`,
`glbLog.js`); it must not import `three` or React — anything heavy is
injected by the host at call time (§6.1), which is also what keeps the
single-three-instance invariant.

For dev (`yarn serve`) and Playwright, where no function runs, the build
ALSO copies each module to `docs/__pro_dev__/<name>.js` when `SHARE_CONFIG`
is `dev` or `playwright` (never `prod`). The MSW handler for
`/.netlify/functions/pro-module` checks the store's `subscriptionStatus`
like `record-load`'s mock does, then proxies to that copy; Playwright specs
`page.route` the same path and `fulfill({path: 'netlify/functions/_pro-modules/glbExport.js'})`.

Two conventions the deploy bundler imposes on anything added under
`netlify/functions/`, both learned by breaking the deploy preview and
neither visible to `yarn build` or to jest:

- **No `node:`-prefixed builtin imports** (`node:fs/promises`, `node:path`,
  `node:crypto`, …). No pre-existing function used one; write `fs/promises`.
  Same reason `import.meta.url` is avoided for locating `_pro-modules/` —
  `process.env.LAMBDA_TASK_ROOT`, falling back to `process.cwd()`, is what
  the deployed lambda and `netlify dev` both understand.
- **Tests go in `netlify/functions/_tests/`**, not beside their subject.
  Every top-level `.js` in the functions directory is bundled AS a function,
  so a `foo.test.js` there deploys as a junk endpoint and pulls jest-only
  imports into the bundle. Subdirectories without a same-named main file are
  ignored, which is why `_lib/` is safe; jest finds `_tests/` either way
  (`roots` includes `<rootDir>/netlify`).

### 4.3 The GLB export (pro module)

`glbExport.entry.js` exports:

```js
export const format = {id: 'glb', ext: 'glb', mime: 'model/gltf-binary'}
export async function exportArtifact({bytes, options}) → {blob, filename, stats}
```

Steps: `isBldrsGlbContainer` → `unpackGlbContainer` → take chunk 0 → if
`options.stripBldrsMetadata`, parse the JSON chunk and drop every `BLDRS_*`
entry from `extensions`, `extensionsUsed` and node/mesh `extensions`, plus the
`bufferViews` they referenced **only if** nothing else references them (the
extension payloads are gzip'd bufferViews; leaving an orphan view is valid
glTF and simpler — v0.1 leaves them, notes the size cost in `stats`) → repack
JSON+BIN with 4-byte padding → `Blob`. The batched-native layout's
`EXT_mesh_gpu_instancing` is a ratified Khronos extension and stays.
Filename: `<title or source basename>.glb`.

Options surfaced in the UI (v0.1): *Include Bldrs metadata (properties,
spatial tree)* — default **on** (it's their model; the toggle exists for
onward sharing).

### 4.4 UI

Lives in the **Save dialog** (`src/Components/Open/SaveModelControl.jsx`), on
an **Export** tab beside Save — one place for "get this model out of here",
reached from the toolbar control the user already associates with producing a
file. (S2/S3 put it in the Share dialog and the Profile menu; smoke feedback
on #1837's preview moved it, #1838.) The tab bar is `Components/Tabs.jsx`, the
Open dialog's pattern, and it only exists behind feature flag `export`
(default off, `?feature=export`) — with the flag off the Save dialog has no
tabs and is exactly what it was.

The Export tab hosts `Open/ExportSection.jsx` (Download GLB + the metadata
toggle) and, under it, `Open/ExportsList.jsx` (§4.5). The dialog's footer
action button belongs to the Save tab only: the Export tab's actions are its
own buttons.

**Gated actions.** An action the user can't take *yet* is not hidden. It
renders in its normal place in a disabled LOOK, stays clickable, and the
click opens help saying what unlocks it, with the unlocking action as a
button. `Components/GatedAction.jsx` is the one implementation: `aria-disabled`
plus dimming on a focusable wrapper that owns the click, `pointer-events:
none` over the child, and NO DOM `disabled` attribute — a truly disabled
button swallows the click, and the help would never open. Test ids:
`gated-<slug>` on the wrapper, `gated-help` on the popover,
`gated-help-action` on its button.

| Action | Unlocked by | Help | Unlocking action |
|---|---|---|---|
| **Save** (toolbar, signed out) | signing in to a connector (GitHub today; Drive per identity-decoupling) | "Log in to one of your connectors to save models" | Log in → `LoginDialog` |
| **GLB export** (Save → Export, signed in, free) | Pro subscription | "Exporting a GLB needs a Pro subscription" | Upgrade to Pro → `Profile/subscriptionNav.js` |
| **GLB export** (signed out — defensive; the dialog only opens signed in) | logging in | "Log in to export this model as a GLB" | Log in → `LoginDialog` |
| **Private sharing** (Share dialog, `sharing` flag) | Pro subscription | "Private links need a Pro subscription" | Upgrade to Pro |

The private-sharing row is the pattern's third instance and lands with the
sharing epic's visibility control — there is no such control in
`ShareDialog.jsx` yet.

The Download GLB button's own states, resolved in this order:

| State | Button | Click |
|---|---|---|
| no model / no artifact yet (`glbArtifact` null, writer in flight) | disabled, "Preparing GLB…" | — |
| not signed in | gated look + lock | help → log in |
| signed in, not Pro | gated look + lock + `Pro` chip | help → subscription flow |
| Pro | "Download GLB" | `useExport().run('glb')` → progress → browser download → snackbar "Exported <name> (<size>)" |
| module load 401/403 | error snackbar "Export requires a Pro subscription" + re-check tier | server said no; the client badge was stale — force-refresh the JWT like `useQuota` does |

The Pro check on the client uses `getTier(appMetadata, isAuthenticated) ===
TIERS.PAID` **for the UI only**; the function is the authority.
`gtagEvent('export_gated', {reason})` fires when the help OPENS, which is the
moment the user met the gate.

Those status snackbars have to be readable while the dialog that started them
is still open, so `theme/Theme.jsx` puts `zIndex.snackbar` (2100) above
`modal` (2000) — MUI's defaults have the opposite order once `modal` is
raised — and `Components/Dialog.jsx` gives the paper a bottom inset and a
`maxHeight` on mobile, sized for the collapsed snackbar band, so a tall
dialog scrolls inside itself instead of sharing pixels with the message.

Download mechanics: `URL.createObjectURL(blob)` → `<a download>` click →
revoke. Safari ≤ 16 ignores `download` on blob URLs in some configurations
and opens the file inline; the smoke checklist (§8) covers it, and the
fallback is `window.open(blobUrl)`.

### 4.5 Tracking ("my exports")

Two layers, mirroring quotas (`design/new/quotas.md`):

- **Server (authoritative for signed-in users):** `record-export.js` —
  Bearer + Pro check, then append `{id, key, title, format, bytes,
  exportedAt}` to `app_metadata.exports`, newest first, capped at 100
  entries (Auth0 `app_metadata` has a 16 KB soft ceiling; 100 × ~150 B is
  well under). Returns `{exports}`. Same read-modify-write caveat as
  `record-load` (last-write-wins; loss direction is a missing history row,
  never a wrong gate).
- **Client:** `src/export/exportHistory.js` keeps one mirror file per
  account, `exports.<encodeURIComponent(sub)>.json`, at the OPFS root (raw
  `navigator.storage.getDirectory()`, no worker dependency — the quota lib's
  pattern) as the instant-display mirror and the offline fallback. Per
  account because OPFS is partitioned by ORIGIN: a single `exports.json`
  would show the next Auth0 account on that browser the previous user's
  titles and share paths, and hand it their `cacheKeyArgs` — i.e. their
  cached artifacts — through "Download again". Every entry point
  (`loadExports` / `saveExports` / `subscribeToExports` / `recordExport` /
  `hydrateExports`) takes the sub; no sub reads empty and writes nothing.
  There is no migration off the old root `exports.json` — the feature is
  flag-gated and unreleased, and a signed-in user's rows come back through
  the `app_metadata` hydration below.
  The JWT is force-refreshed after a successful record AND the claims it
  comes back with are applied to `store.appMetadata` (`useExport` decodes it
  through `Auth0/appMetadata.js`, the same claim `BaseRoutes` reads) — the
  refresh alone only updates Auth0's token cache, so the store kept the
  pre-export list and the hydration below then dropped the row that had just
  been recorded. As shipped, the local row is written FIRST
  and the server's response then replaces the list — the file is already in
  the user's Downloads when `recordExport` runs, so a 401/403/5xx/offline
  keeps the optimistic row and reports `{recorded: false}` rather than
  losing the entry. The recorded `key` is the share path
  (`window.location.pathname`), matching what `record-load` counts.
- **UI:** `Open/ExportsList.jsx`, rendered inline under the Download GLB
  button on the Save dialog's **Export** tab (§4.4) — signed-in only, and
  behind the same `export` flag. It is a plain list, not a dialog: mounting
  IS the "open" signal, so the mirror subscription lives exactly as long as
  the list is on screen, and an export made while the tab is open appears
  under the button that made it. Rows: title, format chip, size, relative
  date, source path (click → navigate to the model). A "Download again"
  action re-runs the export **if** the artifact is still in OPFS
  (`doesFileExistInOPFS` on the recorded key + current schema); otherwise
  the row says "open the model to regenerate". Empty state explains the
  feature and points at the Download GLB button above it.

  One thing the sketch above missed: the server row can't produce that OPFS
  key. A share path has no `sourceHash`, which every `sourceCacheKey.js`
  adapter folds in, so the LOCAL row additionally carries `cacheKeyArgs` +
  `schemaVer` — never sent to the server, re-attached BY ROW ID when the
  server's list is mirrored over the local one (key + format survives only
  as the one-to-one fallback for legacy rows that predate the client id —
  an id-bearing local row the server lacks is one it never accepted, and
  is never paired with a later export of the same model; matching on key
  alone gave every export of one model the newest row's cache key and
  options). The shared in-flight flag is held until the record settles, not
  just until the download fires, since it exists to serialise the mirror's
  read-modify-write. "Download again" therefore
  needs both halves: those fields AND the artifact still on disk. A row
  synced from another device has neither and always offers regeneration.
  `useExport().run(format, options, source)` gained the third argument so
  the dialog can export a model that isn't the one on screen.

  The local row also carries the `options` that export RAN with (the third
  browser-only field, re-attached by the same mirror), and "Download again"
  replays them. Without that the re-download silently uses the defaults, so
  a user who exported with the metadata stripped gets a bigger file carrying
  every `BLDRS_*` payload back — under a row whose size says otherwise.

  Mounting the list also **hydrates the mirror from `app_metadata.exports`**
  (`hydrateExports`), read off `store.appMetadata` — the claim `BaseRoutes`
  decodes. A new device, a new browser profile or a cleared cache otherwise
  shows an empty list although the account's rows exist server-side. The
  merge is the one `recordExport` applies to a record response (server list
  wins, browser-only fields re-attached by row id), and an absent or
  empty claim list is a no-op rather than a wipe. Server-wins is not
  older-wins, though: a claim is a JWT snapshot and can lag the mirror, so a
  local row carrying an id the claim lacks AND newer than every row it does
  carry survives the merge on top. Bounded there deliberately — an id-bearing
  local row older than the claim's newest entry is one the server saw and did
  not keep, and resurrecting it on every open is the opposite bug. Hydrated rows the server
  alone knows about offer regeneration, as before.
- **Analytics:** `gtagEvent('export_model', {format, bytes_bucket,
  source_kind})` on success — `source_kind` is the loader's categorical kind
  (`github` / `local` / `upload` / `external`), carried on the `glbArtifact`
  slot by both producers, NOT the cache key's `ns1` (the repo owner on
  GitHub, a constant everywhere else) and `gtagEvent('export_gated', {reason})` on a
  login/upgrade redirect — the funnel signal for the pricing page.

### 4.6 Hardening summary

- Export code exists only in `netlify/functions/_pro-modules/` (gitignored
  build output) and in the memory of a page that presented a valid Pro
  token. No sourcemap, minified.
- The function verifies the bearer against Auth0 `/userinfo` on every
  request, reads `app_metadata` through the Management API (never trusts
  the JWT claim the client already has), and answers `403` for non-Pro,
  `401` for no/invalid token. Denials are Sentry-tagged with the sub.
- Response headers: `Content-Type: text/javascript`, `Cache-Control:
  private, no-store`, `X-Content-Type-Options: nosniff`. The client revokes
  the blob URL after import and holds the namespace in a module-scope
  `Map` only (gone on reload).
- Dev bypass follows `_lib/auth0.js`: with `AUTH0_DOMAIN` unset the
  function serves the module and fires the existing one-shot Sentry
  warning — same as the OAuth broker functions.
- What this is not: a Pro user can copy the module text from devtools.
  That's the same exposure as any client-side feature and is accepted; the
  line held is *distribution*, which is what the pricing depends on.


## 5. Stages (→ sub-issues of the epic)

| # | Title | Delivers | Tests |
|---|---|---|---|
| S1 | Pro-module pipeline | `proModuleLoader.js`, `pro-module.js` function, `proModuleBuilds()` in build.js, `netlify.toml` `included_files`, dev/playwright copy, MSW handler, eslint import fence, `_lib/auth0.js#getAppMetadata(sub)` factored from `record-load` | jest: loader (blob import mocked), function handler (401/403/200/no-store); tools jest: build emits to `_pro-modules` and not `docs/` in prod |
| S2 | GLB export | `glbArtifact` store slot (writer + reader set, load clears), `pro/glbExport.entry.js`, `useExport`, `ExportSection` in ShareDialog, `export` flag, `subscriptionNav.js` extraction | jest: container→GLB, strip option; **E2E desktop+mobile** (`describeMobileAndDesktop`): Pro user opens a fixture, waits for the writer, clicks Download GLB, asserts a `.glb` download whose bytes start with `glTF`; gated states for anonymous and free |
| S3 | Export tracking | `record-export.js`, `exportHistory.js`, `ExportsDialog.jsx`, Profile menu item, analytics events | jest: history lib (prune/cap/OPFS-unavailable), function handler; **E2E desktop+mobile**: after an export the dialog lists it; "Download again" on a cached artifact |
| S2b | Placement + gated actions (#1838) | Export tab in the Save dialog (`ExportSection` + `ExportsList` moved to `Open/`), Save always visible, `GatedAction.jsx`, `zIndex.snackbar` + mobile dialog inset | jest: gated click still fires, tab hides the Save action, flag-off dialog has no tabs; **E2E desktop+mobile**: signed-out Save shows the help, free Export shows the Pro help, the export snackbar is visible and uncovered over the open dialog |
| S4 | Rollout | This doc folded back to shipped reality, `quotas.md`-style status block, wiki entry, flag flip, roadmap row `share-140` | smoke checklist §8 run on the deploy preview with a real Pro account |
| S5 | Further formats (spec only) | §6 matrix → one issue per format when scheduled | — |

S1 and S2 land in one PR (the smoke instance needs both); S3 follows on the
same branch if timing allows, otherwise its own PR. All behind `export`.


## 6. Other export formats

### 6.1 How a second format plugs in

Each format is a pro module (`src/export/pro/<id>.entry.js`) registered in
`exportRegistry.js` with `{id, label, ext, mime, moduleName, source:
'artifact' | 'scene', status: 'shipped' | 'planned'}`. Two sources:

- **`artifact`** — from the cached GLB bytes (GLB itself; anything a glTF
  → X transform can do). Dependency-free modules, as in S2.
- **`scene`** — from the live three.js `Object3D` (`store.model`). three's
  example exporters (`OBJExporter`, `STLExporter`, `PLYExporter`,
  `USDZExporter`) `import … from 'three'`, and bundling three into the
  module would create a second three instance next to the host's. The
  plan: build the module with `external: ['three']`, and have the host
  loader rewrite the `from"three"` specifier to a runtime-generated shim
  module (a `blob:` module whose text is `export const Vector3 = T.Vector3,
  …` over `Object.keys(THREE)` of the host's namespace, with
  `globalThis.__bldrsThree` set just before import). One shim, generated
  once, shared by every scene-source module. Prototype this in S5's first
  format before committing to it; the fallback is passing the exporter
  classes in from the host, which puts the exporter code back in the
  public bundle (acceptable for OBJ/STL — they are 200-line utilities —
  and not for anything we'd sell on its own).

### 6.2 Feature matrix

What each format can carry. ✔ native, ◐ partial / via convention, ✘ not
representable, — n/a. "Bldrs" columns mean the data Share round-trips today
through `BLDRS_*` extensions.

| Model feature | GLB (S2) | glTF + .bin | OBJ (+MTL) | STL | PLY | USDZ / USD | 3MF | IFC (re-export) |
|---|---|---|---|---|---|---|---|---|
| Triangle geometry | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ◐ (tessellated bodies only) |
| Instancing (batched-native) | ✔ `EXT_mesh_gpu_instancing` | ✔ | ✘ (must de-instance) | ✘ | ✘ | ✔ (references / point instancer) | ✔ (components) | ◐ (mapped items) |
| Per-element identity (expressID / occurrence path) | ✔ `_EXPRESSID` attr, `BLDRS_face_ids` / `BLDRS_instance_tables` | ✔ | ◐ `o`/`g` group names | ✘ | ◐ custom vertex property | ✔ prim paths / customData | ◐ metadata | ✔ (it *is* the id) |
| Source colours (per element) | ✔ | ✔ | ◐ MTL `Kd` per group | ✘ (binary STL colour is vendor-specific) | ✔ per-vertex | ✔ displayColor | ✔ | ✔ IfcStyledItem |
| PBR materials | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ UsdPreviewSurface | ◐ | ✘ |
| Hierarchy / spatial tree | ✔ `BLDRS_spatial_tree` (+ node tree) | ✔ | ◐ flat groups | ✘ | ✘ | ✔ prim hierarchy | ◐ | ✔ |
| Properties / psets | ✔ `BLDRS_element_properties` | ✔ | ✘ | ✘ | ✘ | ◐ customData (size!) | ◐ metadata | ✔ |
| Units + coordination frame | ✔ `scenes[0].extras` (metres) | ✔ | ✘ (unitless) | ✘ | ✘ | ✔ `metersPerUnit`, root xform | ✔ (units attr) | ✔ |
| Cut planes / hidden elements (view state) | ◐ `BLDRS_view_states` (designed, not written) | ◐ | ✘ | ✘ | ✘ | ◐ variants | ✘ | ✘ |
| Compression | ✔ Draco / Meshopt (flags) | ✔ | ✘ | ✘ (binary only) | ◐ binary | ◐ (USDZ is a zip) | ✔ (zip) | ✘ |
| Source | artifact | artifact | scene | scene | scene | scene (or server) | scene | — (needs Conway write support) |
| Effort | done in S2 | small (unpack GLB → JSON + bin) | small | small | small | medium (USDZExporter is texture-centric; instancing + metadata need work); server route if fidelity matters | medium | large — out of scope |

Reading the matrix: OBJ/STL/PLY are cheap and lossy (geometry-only;
identity survives only as group names), which is fine for "send it to a
slicer / Blender" and should be labelled as such in the UI. USD is the one
that preserves what Share knows (hierarchy, ids, units, colours) and is the
likely second premium format; its module is the one that decides whether
§6.1's shim approach holds. IFC re-export is a Conway feature, not an
export module.


## 7. Open questions

1. **Should free users get *one* export?** A single free export is a strong
   conversion moment (the quota design's "anonymous gets 2 loads" logic).
   It changes the function's gate from "Pro" to "Pro, or free with no
   prior export" and adds an `exports` read to the check. Not in v0.1;
   flagged for S4's rollout decision.
2. **`shareProPendingReauth`** — `GitHubFileBrowser` counts it as Pro,
   `getTier` doesn't. The function follows `getTier` (the quota authority);
   the UI badge follows `getTier` too. If pending-reauth users complain, fix
   `getTier`, not the export.
3. **Auth0 `app_metadata` as the export ledger** inherits the quota
   design's migration note (Netlify Blobs / KV when Management-API limits
   bite). Same table, same move.


## 8. Cross-browser smoke checklist (deploy preview, `?feature=export`)

For each of Chrome, Firefox, Safari (macOS), Edge, iOS Safari, Android
Chrome — with a real Auth0 account in each of the three tiers:

1. Open a sample IFC; wait for the load snackbar. Open Share → the Export
   section shows "Preparing GLB…" until the writer finishes, then enables.
2. Anonymous: click → login dialog. Free: click → `/subscribe/`. Pro:
   click → a `.glb` lands in Downloads (check the first 4 bytes are `glTF`
   and it opens in <https://gltf-viewer.donmccurdy.com/>).
3. Pro, DevTools → Network: `pro-module?name=glbExport` is `200`,
   `text/javascript`, `cache-control: private, no-store`; a second click
   does **not** re-fetch (memoised). Free user forging the request gets
   `403`; no token gets `401`.
4. Reload the page: the Export section is enabled immediately (cache-hit
   sets `glbArtifact`); export again → same bytes.
5. Toggle "Include Bldrs metadata" off → the file is smaller and its JSON
   chunk has no `BLDRS_` strings (`strings file.glb | grep BLDRS_`).
6. Save → Export lists the exports below the button, with sizes and dates;
   "Download again" works on the cached one; Clear Local Cache → the row
   says the model must be reopened.
7. Safari specifically: the download is a file, not an inline tab (§4.4
   fallback); OPFS is available (Safari ≥ 17 for `createWritable`).
8. Mobile: the Save dialog's Export tab fits without horizontal scroll at
   390 px, the "Exported …" snackbar is readable over the open dialog, and
   the download lands in Files (iOS) / Downloads (Android).
