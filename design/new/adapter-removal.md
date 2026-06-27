# Removing the `conway-web-ifc-adapter` shim

**Status:** proposal / scope
**Owner:** —
**Branch:** `claude/conway-web-ifc-adapter-removal-s1olih`
**Spans:** `bldrs-ai/Share` (consumer), `bldrs-ai/conway` (engine),
`bldrs-ai/conway-web-ifc-adapter` (the shim — to be retired)
**Parent effort:** [`viewer-replacement.md`](viewer-replacement.md) Phase 5+
**Sibling:** [`conway/design/new/step-support.md`](https://github.com/bldrs-ai/conway/blob/main/design/new/step-support.md)
(its gap #1 — "Public API surface" — is the Conway-side enabler for this)

---

## TL;DR

The `web-ifc-viewer` / `web-ifc-three` fork is already gone
(`viewer-replacement.md` Phase 5). What remains between Share and Conway
is **one** indirection: `@bldrs-ai/conway-web-ifc-adapter`, a separately
versioned npm package that presents a `web-ifc`-compatible `IfcAPI`
backed by Conway internals. Share imports `web-ifc`'s `IfcAPI` and the
`webIfcShimAlias` esbuild plugin rewrites that import to the adapter's
`ifc_api.js` at build time.

The adapter is not buying us isolation — it's costing us a **three-hop
manual release chain** (Conway → adapter → Share) that has frozen Share
on a Conway that is **~22 minor versions behind mainline** (adapter pins
Conway `0.23.977`; Conway HEAD is `1.22.969`). Every STEP-support and
release-automation improvement now landing in Conway is invisible to
Share until someone hand-republishes the adapter.

**Recommendation:** don't rewrite Share onto Conway's *native* API and
don't delete the web-ifc surface. **Move the adapter's `IfcAPI` into the
Conway repo as a published compat entry point** (`@bldrs-ai/conway`
subpath export). Share keeps consuming the same web-ifc-shaped surface
it already does — which is exactly what keeps the **real-`web-ifc`
engine-swap comparison** working — but now sourced from Conway directly.
The standalone adapter package and its manual publish flow are retired.
This collapses the release chain to Conway → Share and is the smallest
change that satisfies all three of the user's goals.

---

## 1. Current state (verified June 2026)

### 1.1 The dependency chain

```
Share src
  └─ import {IfcAPI} from 'web-ifc'          // src/viewer/ifc/ShareIfc.js:45
        │
        ▼  (build-time, USE_WEBIFC_SHIM=true, the default + prod)
  tools/esbuild/plugins.js  webIfcShimAlias
        │  rewrites 'web-ifc' →
        ▼
  node_modules/@bldrs-ai/conway-web-ifc-adapter/compiled/src/ifc_api.js
        │  (deep-imports @bldrs-ai/conway/src/…)
        ▼
  @bldrs-ai/conway   (the actual CAD engine + wasm)
```

When `USE_WEBIFC_SHIM=false` the alias is not registered and `web-ifc`
resolves to the real package — that is the **engine-comparison build**
(`playwright-webifc-run` CI job, `webIfcSingleThreadPlugin`). See
`viewer-replacement.md` slice 5f. Both engines expose the *same*
`IfcAPI` shape; that shared shape is the whole reason a swap is possible.

### 1.2 What the adapter is

`@bldrs-ai/conway-web-ifc-adapter` is a **web-ifc API shim over Conway**.
Its ~92 K-LOC headline is misleading — audited, most of it is dead or
derivable (see §1.5). The load-bearing parts:

| Adapter file | Role |
|---|---|
| `src/ifc_api.ts` (725 L) | The `IfcAPI` class — `Init`, `OpenModel`, `StreamAllMeshes`, `GetGeometry`, `GetCoordinationMatrix`, `GetFlatMesh`, `LoadAllGeometry`, `GetLine*`, `SetWasmPath`, + Conway-only `getStatistics` / `getConwayVersion`, + a `properties` object |
| `ifc_api_model_passthrough_factory.ts` | Format detection → routes **IFC vs AP214 (STEP)** to the right proxy |
| `ifc_api_proxy_ifc.ts` / `ifc_api_proxy_ap214.ts` | Per-format model wrappers driving Conway extraction |
| `ifc_properties.ts` / `properties.ts` / `ap214_properties.ts` | Property + spatial-structure + property-set extraction (Conway's own `IfcPropertyExtraction` only *logs* — the structured surface lives here) |
| `ifc2x4_helper.ts` (42 K) | ~900 web-ifc entity classes + `FromTape` + `FromRawLineData`; produces web-ifc's `GetLine` shape for the properties path (see §1.5 bucket 3) |
| `ifc2x4.ts` / `types-map.ts` / `shim_schema_mapping.ts` | Deterministic web-ifc-code ↔ name ↔ Conway `EntityTypesIfc` mapping; should be code-gen'd, not copied (§1.5 bucket 2) |
| `IFC4x2.ts` (42 K) | **Dead** — byte-identical copy of `ifc2x4_helper.ts`, imported nowhere |

Crucially it **already plumbs STEP through the web-ifc surface**:
`IfcApiModelPassthroughFactory.from()` detects AP214 and builds an
`IfcApiProxyAP214`, so `OpenModel`/`StreamAllMeshes` work for STEP files
through the identical `IfcAPI` Share already calls. STEP support reaches
Share *through the adapter today* — there is no separate Share-side STEP
path to build.

### 1.3 What Conway natively exposes (and doesn't)

`conway/src/index.ts` exports only low-level building blocks:
`IfcGeometryExtraction`, `IfcPropertyExtraction`, `ConwayGeometry`,
`ParseResult`, `Logger`, the AP214 `product` entity, `CanonicalMaterial`,
etc. There is **no** `IfcAPI`, no `FlatMesh`/`PlacedGeometry`, no
coordination matrix, no structured property return, and **no worker
entry**. The cleanest native entry is
`ConwayModelLoader.loadModelWithScene(data) → [Model, Scene]`
(auto-routes IFC/AP203/AP214), but:

- It returns Conway's native `[Model, Scene]` shape (`scene.walk()` over
  `[transform, mesh, material, entity]` tuples), **not** the FlatMesh /
  per-vertex / coordination-matrix shape Share's geometry assembler
  consumes.
- The STEP model/extraction classes the adapter uses
  (`AP214StepModel`, `AP214GeometryExtraction`, …) are **not exported**
  from `index.ts` — this is exactly `step-support.md` gap #1.
- Property extraction returns no structured data natively — the adapter
  builds it.

So "Share talks to Conway's native API" is **not** a thin rewire; it is a
re-implementation of everything the adapter does, *plus* it would throw
away the web-ifc shape that the engine-comparison feature depends on.

### 1.4 Share's actual consumption surface (narrow + contained)

Every consumer lives under `src/viewer/ifc/` + `src/loader/Loader.js`.
One construction site: `new IfcAPI()` in `ShareIfc.js:118`.

**`IfcAPI` methods used** — `Init`, `OpenModel`, `StreamAllMeshes`,
`CloseModel`, `GetGeometry`, `GetVertexArray`, `GetIndexArray`,
`GetCoordinationMatrix`, `SetWasmPath`, `models` (for disposal),
`wasmModule` (init probe). Conway-only and already guarded:
`getStatistics`, `getConwayVersion`.

**`ifcAPI.properties.*` used** — `getSpatialStructure`,
`getItemProperties`, `getPropertySets`, `getIfcType`, `getAllItemsOfType`.

**Data shapes read** — `flatMesh.{expressID, geometries}`,
`placedGeometry.{geometryExpressID, color, flatTransformation}`,
`IfcGeometry.{GetVertexData(Size), GetIndexData(Size)}`.

**Three stray non-engine imports** of `web-ifc` *constants*
(`IFCPRODUCTDEFINITIONSHAPE`, `IFCPROPERTYSET`, `IFCRELDEFINESBYPROPERTIES`)
in `IfcElementsStyleManager.js`, `ViewRulesCompiler.js`,
`bldrsElementProperties.js`. These are slated to fall away with the
`IfcViewsManager` deletion + properties-path cleanup
(`viewer-replacement.md` §8.1, slice 5f) — independent of this work, but
they must resolve *somewhere* until then (see §4.3).

The surface is small and already centralized — the migration is a
**re-pointing of one import + retirement of a package**, not a viewer
rewrite.

### 1.5 The ~92 K LOC is mostly dead or derivable

The headline size is dominated by schema tables, not logic. Audited into
three buckets (drives the Conway-side scope —
[`conway/web-ifc-compat-surface.md`](https://github.com/bldrs-ai/conway/blob/main/design/new/web-ifc-compat-surface.md)):

1. **Dead duplicate (~42 K).** `IFC4x2.ts` is a *byte-identical* copy of
   `ifc2x4_helper.ts`, imported nowhere. Delete outright.
2. **Deterministic mapping (~2 K across 3 files).** `ifc2x4.ts`
   (`NAME → webIfcCode`), `types-map.ts` (`webIfcCode → NAME`), and
   `shimIfcEntityMap` (`webIfcCode → EntityTypesIfc`) are three views of
   one name-keyed bijection — and `shim_schema_mapping.ts` already carries
   `// TODO(nickcastel50): Remove this and add to Code-Gen`. Both sides key
   on the same uppercase name, so the bridge is
   `webIfcCode → name → EntityTypesIfc[name]`. Conway already code-gens
   `entity_types_ifc.gen.ts` (with its *own* sequential indices, not the
   web-ifc FNV codes); the mapping should be generated alongside it, not
   copied. The `IFC*` constants the three stray Share imports need (§4.3)
   come from this generated table.
3. **Live entity parsing (~42 K).** `ifc2x4_helper.ts` is ~900 web-ifc
   entity classes + `FromTape` that produce web-ifc's `GetLine` *shape*,
   backing the properties path (`getItemProperties` → `getLine` →
   `FromRawLineData`). Conway already parses these entities natively
   (`src/ifc/ifc4_gen/Ifc*.gen.ts`) — so the parsing is duplicated, but the
   shapes differ. Shrinking it means reshaping the properties path onto
   Conway-native entities, which is the same work as giving Conway a
   structured property surface (it only logs today). The compat doc treats
   this as a decision point: vendor as-is for the first cut vs reshape now.

Net: "vendor the adapter verbatim" overstates it ~4×. Roughly 0.8 K of
real `IfcAPI`/proxy logic + the property extractors move; ~42 K is
deleted; ~2 K of maps become generated; and the ~42 K entity layer is a
deliberate keep-or-reshape call, not a copy.

---

## 2. The actual problem the adapter creates

1. **Release lag / three-hop chain.** Conway → (manual `yarn upgrade` +
   `npm version` + `npm publish`, per the adapter README) → adapter →
   (bump) → Share. Conway is at `1.22.969`; the adapter pins `0.23.977`;
   Share pins adapter `0.23.954-2`. Share is **not** running the Conway
   that the recent release-automation + STEP work targets.
2. **Two engines of record.** The adapter carries its own 42 K-line IFC
   schema type tables and its own property/spatial extraction — a second
   place IFC semantics live, drifting from Conway's.
3. **STEP-for-prod is gated on a manual republish.** All of
   `step-support.md`'s phased work lands in Conway; none of it reaches
   Share until the adapter is hand-rolled forward.
4. **Invisible coupling via deep imports.** The adapter imports
   `@bldrs-ai/conway/src/…` internal paths, so Conway can't refactor
   internals without silently breaking a package it doesn't build in CI.

The adapter is the right *architecture* (a web-ifc-shaped seam over
Conway) living in the wrong *place* (a separate, manually released repo).

---

## 3. Options considered

### Option A — Absorb the adapter into Conway as a published web-ifc compat surface  ✅ recommended

Move `conway-web-ifc-adapter/src/*` into the Conway repo (e.g.
`conway/src/compat/web-ifc/`), turn its deep `@bldrs-ai/conway/src/…`
imports into intra-repo relative imports, and **export `IfcAPI` from a
Conway subpath** — e.g. `@bldrs-ai/conway/web-ifc` (add to
`package.json#exports`, built by Conway's existing `tsc` pipeline). Share
imports the engine from Conway; the adapter package is archived.

- **Satisfies all three goals:** Share → Conway directly (one dep, one
  version); Conway "just exposes a web-ifc interface surface for legacy
  comparison" (literally the user's framing); and the shared `IfcAPI`
  shape keeps the runtime/​build engine-swap viable (stretch).
- **Smallest Share churn** — the consumer surface is already
  web-ifc-shaped; only the import source + `webIfcShimAlias` target move.
- **Collapses the release chain** to Conway → Share. STEP support and
  release automation reach Share on Conway's cadence.
- **Closes `step-support.md` gap #1** as a side effect — the compat
  surface is the stable public export STEP needs anyway.
- **Cost:** Conway repo grows (the gen tables); Conway CI must build +
  test the compat surface; the adapter's web-ifc↔Conway type maps must
  come along and stay correct.

### Option B — Rewrite Share onto Conway's native `[Model, Scene]` API; delete the web-ifc shape

- **Largest** change: `flatMeshToBufferGeometry`, `IfcInstanceMap`,
  `IfcItemsMap`, `conwayDirectIfcLoader` all assume FlatMesh /
  PlacedGeometry / `GetVertexArray` / coordination matrix; all rewired.
- Conway's native property extraction only logs — a structured property
  API has to be built in Conway *regardless*.
- **Kills the engine-comparison feature** — real `web-ifc` only speaks
  the `IfcAPI` shape; dropping it contradicts the user's "legacy
  comparison" goal.
- Rejected: most work, throws away a capability the user explicitly wants.

### Option C — Status quo, just automate the adapter's release

Cron/CI the adapter republish so it tracks Conway. Removes the *lag* but
keeps two engines of record, the deep-import coupling, and a third repo.
A partial mitigation, not the asked-for removal. Rejected as the
end-state; usable as an **interim** if Option A slips (see §6).

---

## 4. Proposed scope (Option A)

### 4.1 Conway repo — publish the compat surface

1. Vendor the **load-bearing** adapter code (`ifc_api.ts`, the
   proxy/passthrough family, the property extractors) into
   `conway/src/compat/web-ifc/`, rewriting `@bldrs-ai/conway/src/X` imports
   → relative `../../X`. Drop `IFC4x2.ts` (dead); code-gen the type-map
   (§1.5 bucket 2) instead of copying `ifc2x4.ts`/`types-map.ts`/
   `shim_schema_mapping.ts`; handle `ifc2x4_helper.ts` per the properties
   decision (§1.5 bucket 3). Detail in the compat doc's "Scope" +
   "Properties layer" sections.
2. Add a public entry `conway/src/compat/web-ifc/index.ts` re-exporting
   `IfcAPI` + the `ifc2x4` type surface + `Loadersettings` etc. that
   Share consumes (§1.4).
3. `package.json#exports`: add
   `"./web-ifc": { "types": …/compat/web-ifc/index.d.ts, "import": …js }`.
   Keep the existing `"./src/*"` glob so nothing else breaks.
4. Wire the compat tree into Conway's `tsc --build` + `files` so
   `compiled/src/compat/web-ifc/**` ships in the published tarball.
5. Add a smoke test in Conway: open a fixture IFC **and** a fixture STEP
   through `IfcAPI`, assert `StreamAllMeshes` + a property read — i.e.
   move the contract the adapter never tested into Conway CI.
6. Decide versioning: the compat surface ships with Conway's version, so
   the `0.23.x` adapter line is abandoned. (Document the jump for any
   external adapter consumers — see §5.)

### 4.2 Share repo — re-point to Conway

1. `ShareIfc.js`: `import {IfcAPI} from 'web-ifc'` stays *as written*
   (so the `USE_WEBIFC_SHIM=false` real-web-ifc build is untouched), but
   `webIfcShimAlias` (`tools/esbuild/plugins.js:18`) re-targets from
   `@bldrs-ai/conway-web-ifc-adapter/compiled/src/ifc_api.js` →
   `@bldrs-ai/conway/compiled/src/compat/web-ifc/index.js` (or the
   `@bldrs-ai/conway/web-ifc` export).
2. `package.json`: drop `@bldrs-ai/conway-web-ifc-adapter`; add/keep
   `@bldrs-ai/conway` as a **direct** dep at the new version. (Conway is
   currently pulled in transitively via the adapter and
   `@bldrs-ai/ifclib` — make it direct and singular.)
3. Fix the wasm-copy scripts that reach through the adapter:
   `build-share-copy-wasm-conway-profile` copies from
   `node_modules/@bldrs-ai/conway-web-ifc-adapter/node_modules/@bldrs-ai/conway/compiled/dependencies/conway-geom/Dist/*`
   → must become `node_modules/@bldrs-ai/conway/…` (package.json:27).
   Audit all `build-share-copy-wasm-*` targets for the adapter path.
4. Confirm `getStatistics` / `getConwayVersion` resolve on the new Conway
   (they're Conway-native and guarded — should be a no-op, but verify the
   new version still exposes them).
5. Tests/mocks: anything stubbing the adapter package by name moves to the
   Conway compat path. (The viewer-stack harness already mocks at the
   `ShareViewer` seam, not the engine package — low risk.)

### 4.3 The three stray `web-ifc` constant imports

`IfcElementsStyleManager.js`, `ViewRulesCompiler.js`,
`bldrsElementProperties.js` import IFC type *constants* from `web-ifc`.
Two of the three files are already on the `IfcViewsManager`-deletion
chopping block (`viewer-replacement.md` §8.1). For the duration:

- The compat `index.ts` must re-export those constants (they come from
  the adapter's `ifc2x4` surface today), **or**
- These three keep resolving against the real `web-ifc` dep (which Share
  still lists directly at `0.0.35` for the engine-comparison build).

Cleanest: have the Conway compat surface re-export the same `IFC*`
constants so *all* `web-ifc` imports in Share resolve to one place under
the shim; let §8.1 delete the consumers later. **Open item** — confirm
the constant values match between web-ifc `0.0.35` and the adapter's
`ifc2x4` table (they should; both target the same IFC schema).

### 4.4 Adapter repo — retire

Archive `bldrs-ai/conway-web-ifc-adapter`; add a README banner pointing
at the Conway `./web-ifc` export. Keep the repo readable (don't delete)
for history and for any external consumer mid-migration.

---

## 5. Stretch — runtime engine swap (web-ifc ↔ Conway)

Today the swap is **build-time**: two builds, two tabs, selected by
`USE_WEBIFC_SHIM` + `webIfcShimAlias`. A true **runtime** toggle is
tractable *because both engines expose the same `IfcAPI` constructor* —
the dispatch is just "which `IfcAPI` do I `new`?" behind a URL flag /
setting. After Option A, both constructors are import-available
(`@bldrs-ai/conway/web-ifc` and real `web-ifc`). What gates it:

1. **Bundle both engines + both wasms.** Drop the build-time alias for a
   runtime build that ships Conway's MT wasm *and* `web-ifc.wasm`, and a
   factory that picks per a `?engine=` flag.
2. **Cross-origin-isolation conflict (the real blocker).** Per
   `viewer-replacement.md` slice 5f: the app runs cross-origin isolated
   for Conway's MT wasm, which makes `web-ifc 0.0.35` auto-select its
   **multi-threaded** module — and that MT build is structurally
   unshippable as-packaged (missing `web-ifc-mt.worker.js`). The current
   real-web-ifc build pins single-thread via `webIfcSingleThreadPlugin`.
   Runtime dispatch must apply that same ST pin to the web-ifc branch.
3. **Perf caveat.** web-ifc ST is slower than its MT — a runtime
   comparison understates web-ifc on speed (fine for *correctness*
   side-by-side; note it in the UI).

Recommendation: ship Option A first (build-time swap preserved, lag
gone), then spike the runtime toggle as a follow-up gated on the
web-ifc ST pin + dual-wasm bundling. Not on the critical path.

---

## 6. Sequencing & interim

Option A needs a Conway release to exist before Share can point at it —
a chicken/egg with the very release process being warmed up. Order:

1. **Conway PR**: land §4.1, cut a Conway release that ships the
   `./web-ifc` export. (Leans on the new release automation — a good
   first real exercise of it.)
2. **Share PR**: land §4.2/§4.3 against that Conway version behind the
   existing `USE_WEBIFC_SHIM` seam, so the real-web-ifc comparison build
   is unaffected and regressions are bisectable. Gate merge on the
   `playwright-webifc-run` job staying green and a Conway-direct
   render/property/NavTree parity check on Schependomlaan + a STEP file.
3. **Adapter PR**: archive + banner (§4.4).

If the Conway release slips, **Option C** (automate the adapter
republish) is the interim that at least kills the version lag while §4.1
lands.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Conway version jump (`0.23` → `1.22`) changes `IfcAPI`/extraction behavior vs the frozen adapter | Medium | Geometry/property/NavTree drift | Parity check (Schependomlaan + STEP) under the shim flag before merge; the adapter's own proxies are the reference impl to port |
| web-ifc-code ↔ Conway `EntityTypesIfc` map drifts | Low | Wrong type names / picking | Code-gen it from `entity_types_ifc.gen` instead of hand-copying (§1.5 bucket 2); add the Conway IFC+STEP smoke test (§4.1.5) |
| wasm-copy scripts still reach the adapter path | Medium | Build ships no/old wasm | Audit every `build-share-copy-wasm-*` (§4.2.3) |
| Stray `IFC*` constant imports lose their resolver | Low | Build break in 3 files | Re-export constants from compat `index.ts` (§4.3) |
| Conway repo bloat (42 K-line gen tables ×2) slows CI | Low | Slower Conway builds | Tables are generated; compat tree is `tsc`-only, no codegen on PR |
| Engine-comparison build regresses unnoticed | Medium | Lose the legacy reference | Keep `playwright-webifc-run` required-adjacent; it already exercises real web-ifc |

---

## 8. What this unlocks

- Share runs **current Conway** — STEP-for-prod, release automation, and
  every geometry/perf fix land on Conway's cadence, not the adapter's.
- **One** IFC engine of record; the 42 K-line duplicate schema tables and
  the manual publish flow are gone.
- Conway gains a **tested, public** web-ifc compat surface — directly
  closing `step-support.md` gap #1.
- A clean base for the **runtime engine swap** (§5).
- Removal of: the `@bldrs-ai/conway-web-ifc-adapter` dep, its nested
  `node_modules/@bldrs-ai/conway`, the adapter-path wasm-copy scripts, and
  the three-hop release chain.

---

## 9. Open questions

1. **Subpath vs dedicated package.** `@bldrs-ai/conway/web-ifc` subpath
   export (recommended, one version) vs a second published package from
   the Conway monorepo. Subpath is simpler and matches "Conway exposes
   the surface."
2. **Constant re-export vs real web-ifc for the 3 stray imports** (§4.3)
   — pick one before the Share PR; depends on whether §8.1 lands first.
3. **AP203 through the compat surface.** The adapter routes IFC + AP214;
   `step-support.md` Phase 4 is still deciding AP203 (fall-through vs own
   gen tree). The compat factory should fail loudly, not silently
   mis-route, on AP203 until that lands.
4. **External adapter consumers.** Does anything outside Share depend on
   `@bldrs-ai/conway-web-ifc-adapter` on npm? If yes, the archive banner
   + a final compat-pointer release; if no, archive outright.
</content>
