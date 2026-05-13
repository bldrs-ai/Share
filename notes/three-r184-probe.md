# three.js 0.135 → r184 probe — findings

**Branch:** `claude/three-r184-probe`
**Base:** `c8b2095` (main, post-#1512 merge)
**Probe target:** `three@^0.184.0` against the existing
`web-ifc-viewer-1.0.209-bldrs-7.tgz` fork (no Phase 3 work)

## Per-gate result

| Gate | Result | Notes |
|---|---|---|
| `yarn install` | ✅ pass | Peer warnings only: web-ifc-viewer wants `three@^0.135.0`, web-ifc-three wants `three@0.135`. Yarn 1.22.22 (classic) warns but installs; `resolutions` in `package.json` forces every consumer to the same `three@0.184.0`. |
| `yarn lint` (eslint + tsc) | ✅ pass | Required `typescript@4.9.4 → ^5.7.2` because `@types/three@0.184` uses TS5 const-type-parameter syntax (`<const TNodeType>`). Added `skipLibCheck: true` to `tsconfig.json`. Two latent TS5-strictness issues in our code surfaced and fixed (`src/utils/debug.js:18`, `src/Components/Apps/IframeIntegration.spec.ts:41`). |
| `yarn test` (jest) | ✅ 1150 pass / 5 skipped | All 6 toJSON-shape snapshots regenerated (lowercase UUIDs, new `blendColor` / `envMapIntensity` / `envMapRotation` fields, pruned default stencil/depth fields, version `4.5 → 4.7`). One test-infra fix: `setupMockBlobWithContent` was returning a Node `Buffer.buffer`-slice that fails three's r184 `instanceof ArrayBuffer` strict check under jsdom; now copies into a realm-native `ArrayBuffer`. |
| `yarn build-prod` (esbuild) | ✅ pass | Two compatibility fixes added to `tools/esbuild/plugins.js` as `threeJsmCompat` plugin: (a) modern three's `package.json#exports` requires literal `.js` extensions on `examples/jsm/*`; the fork omits them — plugin appends `.js`. (b) `mergeBufferGeometries` was renamed to `mergeGeometries` in r155+; plugin shims the alias into the loaded module. |
| `yarn test-flows` (Playwright) | ⚠️ not runnable in sandbox | `Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1181/...` — chromium binary missing from this environment. Will run in CI. |
| Browser smoke | ⏳ deferred to user | Build artifacts are in `docs/`; serve with `yarn test-flows-serve` or `yarn serve` and exercise the headline flows (orbit, click-select, cut-plane, screenshot, DRACO GLB). |

## What broke and what fixed it

### Category A — our code (codemoddable, kept)

| Issue | File | Fix |
|---|---|---|
| `import 'three/examples/jsm/loaders/X'` no longer resolves (missing `.js`) | `src/loader/Loader.js`, `src/loader/Loader.test.js`, `src/loader/obj.js`, `src/loader/stl.js`, `src/utils/svg.js` | Append `.js` to all 11 imports (sed pass). |
| `@types/three@0.184` parse errors under TS 4.9 | `tsconfig.json`, `package.json` | Bump `typescript: 4.9.4 → ^5.7.2`. Add `skipLibCheck: true`. |
| TS5 narrowing on `number \| boolean` comparison | `src/utils/debug.js:18` | Add `typeof level === 'number'` guard. |
| TS5 stricter `writeFile(Buffer)` typing | `src/Components/Apps/IframeIntegration.spec.ts:41` | Wrap in `new Uint8Array(content)`. |
| Object3D toJSON shape evolution | `src/loader/__snapshots__/Loader.test.js.snap`, `src/utils/__snapshots__/svg.test.js.snap` | `jest -u`. |
| `instanceof ArrayBuffer` cross-realm failure under jsdom | `src/loader/Loader.test.js` (`setupMockBlobWithContent`) | Copy buffer into realm-native ArrayBuffer. |

### Category B — fork-side (worked around at build time, not patched)

| Issue | Where | Mitigation |
|---|---|---|
| `three/examples/jsm/*` imports without `.js` extension | `node_modules/web-ifc-viewer/dist/**`, `node_modules/web-ifc-three/IFCLoader.js` | esbuild `onResolve` plugin appends `.js` |
| `mergeBufferGeometries` import (renamed to `mergeGeometries` in r155+) | `node_modules/web-ifc-three/IFCLoader.js`, `node_modules/web-ifc-viewer/.../edge-projection.js` | esbuild `onLoad` plugin appends `export { mergeGeometries as mergeBufferGeometries }` alias when loading `BufferGeometryUtils.js` |
| Fork's peer pin to `three: 0.135` (web-ifc-three exact, web-ifc-viewer `^0.135.0`) | `node_modules/*/package.json` | `resolutions` in root `package.json` (yarn classic respects this) |

**No Category C — non-codemoddable fork-side breakage** — was found during the probe.

### Not addressed (out of probe scope, pre-existing)

- **DRACO decoder path**: `src/loader/Loader.js:591` sets
  `dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/')`. This is a build-time path that doesn't resolve in the
  browser. PR #1509 fixes this with `./static/js/draco/` + a copy step.
  Not touched here.

## Total diff size

- `package.json` — 5 deps bumped, `resolutions` added
- `tsconfig.json` — 1 line (`skipLibCheck: true`)
- `tools/esbuild/plugins.js` — 1 plugin added (~35 lines)
- `src/loader/{Loader,obj,stl}.js`, `src/loader/Loader.test.js`,
  `src/utils/svg.js` — 11 lines (`.js` suffix codemod)
- `src/loader/Loader.test.js` — `setupMockBlobWithContent` rewrite (~6 lines)
- `src/loader/__snapshots__/Loader.test.js.snap`,
  `src/utils/__snapshots__/svg.test.js.snap` — regenerated
- `src/utils/debug.js`, `src/Components/Apps/IframeIntegration.spec.ts` —
  2 lines

About **20 lines of code change** (excluding the snapshot regeneration
and `package.json`/`tsconfig.json` config bumps). The esbuild plugin is
the only non-trivial addition.

## Recommendation

**Patch-and-ship.**

The probe came in cleanly. All gates that can run in this environment
pass. The fork-side issues are limited to two surface concerns (missing
`.js` extensions, one renamed export) and both are handled by a single
~35-line esbuild plugin that lives in our build config — no fork .tgz
modification required. The TS5 bump is independently good hygiene and
unblocks `@types/three` to ride the latest.

The 2–3 week Phase 3 (Conway / `IfcModelService` / subsets on flat-mesh)
work is **not required** to ship the three.js upgrade. It remains the
right long-term move (fork is dead upstream, we still pay every time a
new three version drops new API drift), but it's no longer the gate for
the upgrade.

### Suggested next-PR shape

1. **r184 upgrade PR** — these changes, cleaned up:
   - `package.json` (three, @types/three, postprocessing, typescript,
     three-mesh-bvh, resolutions)
   - `tsconfig.json` (`skipLibCheck`)
   - `tools/esbuild/plugins.js` (`threeJsmCompat` plugin)
   - Our `src/` codemod (`.js` suffixes, the two TS5 narrows, the
     ArrayBuffer test-infra fix)
   - Regenerated snapshots
   - Optionally: also fix the DRACO decoder path while we're here
     (unblocks #1509's `glbDraco` unconditional path)
2. **Browser smoke gate** — manual run on the build before merge.
   Particularly important: color-space (`SRGBColorSpace` default change
   at r152), light intensities (default change at r157). Design doc §6
   says we don't touch the worst-affected APIs, but a 30-second visual
   check on Schependomlaan is cheap insurance.
3. **Phase 3 work** stays on the roadmap but no longer gated by the
   three upgrade. It becomes a freestanding "remove the dead fork"
   initiative that can be timed against #1509 and any other in-flight
   work that touches the IFC pipeline.

### Risks not fully verified

| Risk | Status |
|---|---|
| Fork's internal raycaster / subset BVH path silently misbehaves on r184 (no compile-time signal) | **Untested** — needs browser smoke on a large IFC with click-select / hover-pick. Likely the highest-value manual gate. |
| `MeshLambertMaterial` colors visually shift (color management default change in r152) | **Untested** — needs eyeball on Schependomlaan or any baked-color model. Mitigation if shifted: set `renderer.outputColorSpace = SRGBColorSpace` explicitly. (Not done in this probe; design doc §6 prescribes it.) |
| Outline highlight visuals drift (postprocessing `OutlineEffect` against new three) | **Untested** — same mitigation: visual check. |
| Camera-controls 1.36.1 against r184 (we kept it on 1.x) | Install OK, runtime untested |
| Conway worker path (when feature-flagged on) | Unchanged by this probe; should work identically |

None of these block the upgrade — they're all "verify in the browser
before merging the upgrade PR" items.
