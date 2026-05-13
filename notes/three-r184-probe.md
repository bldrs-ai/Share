# three.js 0.135 → r184 upgrade — reference

Documents the actual changes shipped in PR #1514. The chronological
debugging log lives in the git history of `claude/three-r184-probe` if
you ever need it.

For the *why* behind each change — what three.js changed, when, and
where the migration to PBR / tone-mapping picks up — see
`design/new/viewer-replacement.md` §6.

## Per-gate result

| Gate | Status |
|---|---|
| `yarn install` | ✅ peer warnings only (web-ifc-viewer / web-ifc-three pin `three@0.135`; `resolutions` overrides) |
| `yarn lint` (eslint + tsc) | ✅ |
| `yarn test` (jest) | ✅ 1150 pass / 5 pre-existing skips |
| `yarn build-prod` (esbuild) | ✅ |
| `yarn test-flows` (Playwright) | ✅ runs in CI; not runnable in the dev sandbox (chromium binary) |
| Browser smoke — orbit / click-select / cut-plane / screenshot / colors | ✅ verified pixel-identical to prod r135 with a digital color meter |

## Changes that landed

### Our code (`src/`, `tsconfig.json`)

| File | Change |
|---|---|
| `src/viewer/ShareViewer.js` | Module-level `ColorManagement.enabled = false`; `renderer.outputColorSpace = LinearSRGBColorSpace` in constructor. The compat trio with the scene.js light scaling (below). |
| `src/loader/Loader.js` | `.js` extension appended to 8 `three/examples/jsm/*` imports. DRACO decoder path NOT changed (#1509 territory). |
| `src/loader/obj.js`, `src/loader/stl.js`, `src/utils/svg.js`, `src/loader/Loader.test.js` | `.js` extension appended to 3 more imports. |
| `src/loader/Loader.test.js#setupMockBlobWithContent` | Buffer slice copied into a realm-native `ArrayBuffer` so r184's `GLTFLoader.parse instanceof ArrayBuffer` check passes under jsdom. |
| `src/utils/debug.js:18` | `typeof level === 'number'` guard for TS5 narrowing on `number\|boolean`. |
| `src/Components/Apps/IframeIntegration.spec.ts:41` | `new Uint8Array(content)` wrap for TS5's tightened `writeFile` overloads. |
| `src/loader/__snapshots__/Loader.test.js.snap`, `src/utils/__snapshots__/svg.test.js.snap` | Regenerated for r184 toJSON shape (lowercase UUIDs, new `blendColor` / `envMapIntensity` / `envMapRotation`, pruned default stencil/depth, version `4.5 → 4.7`). |
| `tsconfig.json` | `skipLibCheck: true`. `@types/three@0.184` uses TS5 const-type-parameter syntax. |

### Build / packaging (`package.json`, `tools/esbuild/plugins.js`)

| File | Change |
|---|---|
| `package.json` | `three 0.135.0 → 0.184.0`, `@types/three 0.146.0 → 0.184.1`, `postprocessing 6.29.3 → 6.39.1`, `typescript 4.9.4 → 5.7.2`. New `resolutions: { three: 0.184.0, three-mesh-bvh: 0.9.10 }`. All exact pins — the compat plugin's regex rewrites are tuned to specific fork-source shapes. |
| `tools/esbuild/plugins.js` | New `threeJsmCompat` plugin (5 hooks; see "fork compat layer" below). |
| `tools/esbuild/plugins.test.js` | Unit tests on the plugin's pure helpers (hit + no-op-throws). |

### Fork compat layer (the `threeJsmCompat` esbuild plugin)

Five hooks, all targeted at fork-vendored files only. Each rewrite throws
on a no-op `replace()` so a future fork repack fails the build instead
of silently re-introducing a bug at runtime.

| Hook | Target | What it patches |
|---|---|---|
| `onResolve` | `three/examples/jsm/[^.]+$` | Modern three's `package.json#exports` maps these literally — no `.js` fallback. Re-resolves with `.js` appended. |
| `onLoad` | `three/.../BufferGeometryUtils.js` | r155+ renamed `mergeBufferGeometries` → `mergeGeometries`. Plugin appends an alias re-export to the loaded module. |
| `onLoad` | `web-ifc-viewer/.../planes.js` | r155+ `TransformControls` no longer extends `Object3D`; the gizmo is at `controls.getHelper()`. Plugin rewrites five fork call-sites with a feature-detect fallback. **Without this, clicking any section plane throws at runtime** — caught only by browser smoke. |
| `onLoad` | `web-ifc-viewer/.../scene.js` | r157 removed `useLegacyLights`; physically-correct defaults make the same numeric intensity ~π× dimmer. Plugin scales the three hardcoded `DirectionalLight` / `AmbientLight` intensities by `Math.PI`. |
| `onLoad` | `web-ifc-viewer/.../context.js` | r183 added a `console.warn` on `new Clock(true)`. `Timer` isn't a drop-in (different semantics). Plugin strips `Clock` from the `three` import and inlines a tiny API-compatible class using `performance.now()`. |

## What's deliberately not in this PR

- **DRACO decoder path** in `Loader.js#newGltfLoader` still points at
  `./node_modules/three/examples/jsm/libs/draco/`. PR #1509 fixes this
  alongside its own DRACO work; merging both is cleaner than racing.
- **PBR / tone-mapping migration**. The compat path above is a
  deliberate hold to preserve r135's visual baseline. The five-step
  migration plan is in `viewer-replacement.md` §6e — Phase 5 (drop
  fork) opens the door, a follow-up visual-quality PR finishes it.
- **Phase 3** (Conway / IfcModelService). The probe proved it isn't
  required for the three.js upgrade. Stays on the roadmap for fork
  removal.
- **`postprocessing@7`**. Stays on 6.39.1 for this PR; design doc §4
  Phase 5 work.
- **`camera-controls` 1.x → 3.x**. Stays on 1.x; design doc §6
  flags this as low-risk follow-up.
