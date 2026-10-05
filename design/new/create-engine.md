# Create engine — CADAM review and Conway write-path scoping

**Status:** research complete (#1921, a story of `create-320` #1920), 2026-10-05.
**Lands through:** the `create-300` op log ([model-edit.md](model-edit.md)).

**Sources.** All read at a pinned commit:

- **CADAM:** [`Adam-CAD/CADAM`](https://github.com/Adam-CAD/CADAM) @ `eb21680`
  (2026-09-18, tag `v0.3.0`).
- **Conway:** [`bldrs-ai/conway`](https://github.com/bldrs-ai/conway) @ `e1d1fbe`
  (2026-10-01).
- **Share:** main @ `e6bbef6`.

Paths prefixed `CADAM/` and `conway/` are repo-relative at those commits;
unprefixed paths are Share's. Every claim is tagged **[V]** (verified in source,
with a reference) or **[I]** (inferred or recommended).


## Recommendation

1. **Don't adopt CADAM as an engine, an iframe app or a service. Borrow its
   ideas, and use the upstream OpenSCAD WASM directly.** CADAM is a thin
   React/Supabase shell around three things: the upstream OpenSCAD WASM, a
   well-tuned system prompt, and a "compile → render several views → let the LLM
   look → rewrite" loop. What it adds on top (Supabase auth/DB/storage, billing,
   fal.ai mesh generation, its own chat store) duplicates Share's T10/T11 plans
   or crosses the data-sovereignty boundary. [I]
2. **Two generators, both landing as `create-300` ops** [I]:
   - **Tier 1 (ship first): IFC-shaped extrusions.** The `create` payload *is*
     the extrusion: profile, depth, direction, placement, IFC class and psets.
     Share meshes it in JS. It maps 1:1 onto `IfcExtrudedAreaSolid`, so a Conway
     writer can export it later with no loss. This is model-edit.md L2's
     "create primitive", promoted to the agent-facing generator.
   - **Tier 2: embedded OpenSCAD WASM**, for freeform parametric parts
     (brackets, knobs, gears, fixtures). Payload
     `{generator: 'openscad', engineVersion, code, params, ifcClass, psets}`.
     A parameter edit is a `setProperty` that re-runs the compile. The mesh is a
     derived artifact, cached in OPFS by a hash of the payload, never the source
     of truth. IFC export is a triangulated mesh only
     (`IfcTriangulatedFaceSet` / `IfcFacetedBrep`), never B-rep.
3. **Conway has no writer, but has the hooks for a cheap, exact byte-splice
   writer** (§B1). Smallest useful slices, in order: attribute and pset values,
   placements, appended `IfcExtrudedAreaSolid` products (Tier 1 export), then
   triangulated-mesh products (Tier 2 export). About 1.5–2.5k lines of
   TypeScript including tests, no conway-geom (C++) change; 2–4 engineer-weeks
   for slices 1–3. [I]
4. **GlobalIds are minted when the `create` op is created**, stored in it as
   the element's ref (`g<GlobalId>`, model-edit.md §5), and never re-minted.
   Express ids are allocated only at export and never stored in the log. [I]


## Part A: CADAM

### A1. License [V]

- CADAM is **GPL-3.0** (`CADAM/LICENSE`, `CADAM/README.md` §License).
- The bundled OpenSCAD WASM (OpenSCAD `2025.03.25.wasm24456`, git `ce5039f8a`)
  is GPL-2.0-or-later, shipped unmodified
  (`CADAM/src/vendor/openscad-wasm/SOURCE-OFFER.txt`).
- Bundled libraries `CADAM/public/libraries/{BOSL,BOSL2,MCAD}.zip`: BOSL and
  BOSL2 are BSD-2, MCAD LGPL-2.1 [I, upstream knowledge].
- Parts derive from `openscad-web-gui` (GPLv3) (`CADAM/README.md`,
  `CADAM/src/worker/openSCAD.ts:18-19`).
- Share is AGPL-3.0 (`package.json:5`, `LICENSE`).

What that allows [I; a license reading, not legal advice]:

- **Embedding or forking** is permitted: GPLv3 §13 and AGPLv3 §13 allow the
  combination, and Share already carries the AGPL network obligation. The
  catch is that third-party GPL code would block any future relicensing (dual
  license, CLA) of the files it touches. Taking only the upstream OpenSCAD WASM
  (GPL-2-or-later, so AGPL-compatible through "or later") and writing our own
  glue avoids that.
- **Calling it as a service** has no license constraint, but there is no
  public API (A3).

### A2. Representation [V]

- **The LLM emits complete OpenSCAD source** through the
  `build_parametric_model` tool, schema `{title, version, code}`, where `code`
  is "complete raw OpenSCAD code, no markdown" (`CADAM/shared/chatAi.ts:19-23,
  42-48`; prompt `CADAM/src/server/aiChat.ts:173-329`).
- **No B-rep and no STEP.** OpenSCAD is a CSG/mesh kernel, run with
  `--backend=manifold` (`CADAM/src/worker/openSCAD.ts:233-246`). Outputs:
  STL (`openSCAD.ts:22-25, 179-186`), OFF with per-face RGBA to recover
  `color()` (`openSCAD.ts:218-245`, parser `CADAM/src/utils/offParser.ts`), SVG
  for 2D (`openSCAD.ts:250-275`) and DXF. A GLB is built client-side with
  three's GLTFExporter (`CADAM/src/components/viewer/DownloadMenu.tsx:572-668`).
- **No part or semantic identity** beyond per-face colour: STL and OFF are one
  merged mesh [V by format; that lazy-union never splits it per object is I].
- A second, "creative" mode generates meshes server-side through fal.ai and
  image models (`CADAM/src/server/mesh.ts`, `imageGen.ts`; `create_mesh` tool
  `CADAM/shared/chatAi.ts:55-60`). Out of scope: server-side, non-parametric,
  costly.

### A3. Runtime and data sovereignty [V]

**Client:** the compile runs in a Web Worker (`CADAM/src/worker/openSCAD.ts`,
`worker.ts`, `src/hooks/useOpenSCAD.ts`). The WASM is 9.6 MB, BOSL2 0.8 MB
zipped. Parameter sliders re-run the compile locally with no LLM call: a regex
rewrites the top-level assignment (`CADAM/src/views/EditorView.tsx:555+`,
`updateParameter` in `CADAM/src/lib/utils.ts:107`) and the worker passes
`-Dname=value` (`openSCAD.ts:164-178`).

**Server** (TanStack Start routes plus Supabase):

- LLM calls go through `CADAM/src/routes/api/parametric-chat.ts` →
  `handleAiChatRequest` (`aiChat.ts:1052+`). Auth is required (401 without a
  Supabase user, `aiChat.ts:1060-1072`) and billing is checked first (402
  without tokens, `aiChat.ts:1095-1123`, `CADAM/src/server/billingClient.ts`).
- The conversation lives in Supabase Postgres; the server rebuilds context from
  the DB, never from the client body (`aiChat.ts:342-360`).
- Every build's preview PNG and 7-view inspection sheet go to Supabase Storage
  (`CADAM/src/components/chat/ChatSession.tsx:462-511`), and the server attaches
  the sheet to the next LLM turn (`aiChat.ts:994-1033`). User-attached meshes
  are uploaded too (`CADAM/src/components/TextAreaChat.tsx:830-840`).

**Sovereignty** [I]: the README's "runs entirely in your browser" is true of
the compile only. In Share, text→new-part creation sends only the prompt and
the generated part, which roadmap §7.2 allows ("conversation plus tool
results"). Any inspection render that includes the user's surrounding model is
model-derived data and goes through the "what the AI can see" boundary. The
default is to render the created element in isolation.

### A4. LLM plumbing [V]

- Vercel AI SDK v6 with Anthropic, Google and OpenRouter providers
  (`CADAM/package.json`; router `aiChat.ts:391-397`), behind a model picker
  (`aiChat.ts:66-159`).
- **Self-review loop.** Two tools, `build_parametric_model` and `answer_user`.
  After each build the browser compiles and returns a 7-view sheet, and the
  model must inspect it and rebuild until satisfied: up to 60 steps
  (`aiChat.ts:1369`), with the build tool forced on step 0 where the provider
  allows it (`aiChat.ts:1310-1367`).
- **The tool runs client-side.** The server tool has no `execute`; the client's
  `onToolCall` compiles, renders and uploads the views, persists the tool part,
  then calls `addToolOutput`, which resubmits
  (`CADAM/src/components/chat/ChatSession.tsx:225-560`).
- **Edits.** "Make the hole bigger" by prompt regenerates the whole script (the
  contract is complete OpenSCAD, not a diff). By slider, there is no LLM call.
- **Parameters.** The prompt requires top-of-file variables with OpenSCAD
  Customizer annotations (`name = 10; // [min:step:max]`, enums,
  `/* [Group] */`, a `*_color` suffix) (`aiChat.ts:252-274`). A regex parser
  derives the UI from the code (`CADAM/shared/parseParameters.ts:1-80`), with a
  TODO to replace it with an AST parser. The original code is stashed on the
  first parameter edit so defaults stay stable (`CADAM/shared/chatAi.ts:119-134`).

### A5. Architecture and health [V]

- React 19, TanStack, Vite, Tailwind/shadcn, three r160 via R3F, Supabase,
  PostHog, Sentry. About 42k lines of TS/TSX; the core is small (`aiChat.ts`
  1752, `mesh.ts` 1638, `openSCAD.ts` 503, `parseParameters.ts` 286).
- **Declining activity:** 309 commits since 2025-11-06; monthly 124 (Apr-26),
  44, 38, 18, 9, 2 (Sep). About 80% of commits are by one author. Backed by
  Adam AI Labs, Inc., which hosts it as adam.new.
- **Thin testing:** four `node:test` files, no `test` script, no CI;
  pre-commit is `tsc -b` plus lint-staged. The OpenSCAD compile and the
  parameter parser are untested.
- Comments are careful; helpers are duplicated (`updateParameter` in
  `src/lib/utils.ts:107` and `src/utils/parameterUtils.ts:231`); Supabase and
  billing are coupled throughout. **Reusable without the app:** the OFF parser,
  the parameter parser, the worker wrapper and the prompt.

### A6. Mapping onto the op log [I]

**`create`: the payload is the recipe, not the mesh.**

```
{id, kind: 'create', layer: 'document', ref: 'g<GlobalId>',
 payload: {generator: 'openscad', engineVersion: '2025.03.25',
           code, params: {name: value, ...},
           ifcClass: 'IfcBuildingElementProxy' | ..., name, psets,
           placement: {parentRef, matrix}}}
```

- **Apply:** compile in a worker → OFF → `BufferGeometry` (per-vertex colour,
  or one geometry per colour group) → `addGeometry` + `addInstance`. That needs
  model-edit.md L0: post-load `addGeometry`, growable side tables, reused ids.
  The opaque/transparent split applies when `color()` uses alpha.
- **Replay** re-runs OpenSCAD, which takes seconds for complex parts. Cache the
  derived mesh in OPFS keyed by `hash(engineVersion, code, params)`; the log
  holds code text, never mesh bytes. That fits L3's rule that an edited model
  never writes under its source's key.
- **Determinism.** Pin the WASM version in the payload. A different OpenSCAD
  build can tessellate differently, so a version bump invalidates the mesh
  cache; it must not change the document.

**`setProperty` on params.** `{ref, payload: {path: 'params.wall_thickness',
value: 3}}` re-runs the compile, and the backend derives the matching
`setGeometry`. Log only the `setProperty`, so undo is one step. "Make the hole
bigger" in chat becomes a `setProperty` when the parameter exists (no codegen)
or a `setGeometry {payload: {code}}` when the script has to change. The agent
should prefer the parameter route; CADAM's prompt contract (every dimension a
named top-level parameter) usually makes it available.

**IFC semantics.** OpenSCAD carries none, so class, name and psets come from
the `create-310` tool call. Default class `IfcBuildingElementProxy`, with the
agent choosing a better one when it is obvious (IfcFurniture, IfcMember, …).
Stamp a `Bldrs_Generator` pset (`generator`, `engineVersion`, code hash,
params) for provenance on export. One script per IFC element; a grouping
`IfcElementAssembly` can come later.

### A7. Integration options, ranked [I]

| Rank | Option | Cost | Value |
|---|---|---|---|
| 1 | **Embed upstream OpenSCAD WASM with our own prompting; borrow CADAM's ideas** | Medium: ~1–2k lines in Share (worker, OFF→geometry, parameter parser, apply backend, `create-310` tool, mesh cache) plus a lazy 9.6 MB WASM and ~1 MB of libraries behind the flag | High: parametric, editable, client-side, native to the op log. The agent writes a DSL that runs in a DOM-less worker, so "the agent writes ops, never scene code" holds. |
| 2 | **Tier 1 extrusions, no engine** | Low; largely model-edit.md L2 | Medium for BIM-ish creation (walls, slabs, columns); low for mechanical parts. The best fit to IFC and to a future Conway writer. Ship first. |
| 3 | Iframe app over WidgetApi/postMessage | Looks low, is medium-high | Low (below) |
| 4 | Call it as a service | — | Negative: no public API; endpoints need Supabase auth and billing (`aiChat.ts:1060-1123`); routes the conversation through a third party, against §7.2 and T10 |

Ideas worth borrowing for rank 1: the Customizer-annotation parameter
contract, the multi-view self-inspection loop, the forced first tool call, and
the BOSL2 guidance for threads and sweeps. Take the WASM from upstream
openscad-wasm or openscad-playground rather than from CADAM.

**Why rank 3 doesn't hold today** [V]: `src/WidgetApi/` is the Matrix-widget
API for *Share embedded in a host* (`src/WidgetApi/WidgetApi.js:14-19`), not a
host for apps. The AppsDrawer channel answers only `getLoadedFile` and
`getSelectedElements`, with no write messages
(`src/Components/Apps/AppsMessagesHandler.js:36-46`), and the iframe has no
`sandbox` attribute (`src/Components/Apps/AppIFrame.jsx:49-54`). CADAM has no
postMessage API, so it would have to be forked anyway, and the user would get
a second login, billing system and chat.


## Part B: Conway write path

### B1. What exists [V]

- **No IFC/STEP writer.** Outside generated code, serializers are the index
  sidecar (`conway/src/index.ts:96-98`) and CLI geometry dumps
  (`conway/src/AP214E3_2010/ap214_command_line_main.ts:319-326`).
- **The web-ifc compat write APIs are logged no-ops:** `CreateModel` returns 0
  (`conway/src/compat/web-ifc/ifc_api.ts:640-644`), `ExportFileAsIFC` returns a
  1-byte array (`:651-655`), `WriteLine` (`:826-828`), and
  `CreateIfcGuidToExpressIdMapping` is commented out (`:1648-1671`). Mirrored in
  `ifc_api_proxy_ifc.ts` and `ifc_api_proxy_ap214.ts`.
- **Entities are read-only, lazy views over the source buffer**: generated
  getters, no setters (`conway/src/ifc/ifc4_gen/IfcRoot.gen.ts:20-50`;
  `conway/src/step/step_entity_base.ts:265-490`).
- **Hooks a writer can build on:**
  - each record's exact source byte span: `recordAddress` / `recordLength`
    (`conway/src/step/step_model_base.ts:800-814`);
  - `maxIndexedExpressID` (`step_model_base.ts:312`), for allocating new ids;
  - per-field byte offsets through the vtable (`getOffsetAndEndCursor`,
    `step_entity_base.ts:1197-1228`), which allow attribute-level splicing
    without re-encoding the record;
  - schema reflection (`fields` / `orderedFields`, `step_entity_base.ts:162-210`);
  - ordered attribute arrays via the IFC4 DTOs' `ToTape()` / `FromTape()`
    (`conway/src/compat/web-ifc/ifc2x4_helper.ts`, e.g. 7711-7760). The missing
    half is a tape → STEP-text encoder;
  - `parseDataToModel(buffer)` (`conway/src/ifc/ifc_step_parser.ts:67`), which
    can parse and mesh a small generated IFC snippet with the existing pipeline.
- **The design already exists:** `conway/design/new/streaming-federated-loader.md`
  §"Toward editing: product-level CRUD" (lines 1346-1382). The unit of edit is
  the product; edits are an overlay (tombstones plus an append journal with
  express ids from a reserved range) over immutable source bytes; writing back
  is append-friendly and unmodified regions round-trip byte-exact. Decisions
  that would preclude the overlay "are bugs against this doc" (`:1388-1392`).
  This is the same shape as model-edit.md §1.

**Side finding** [V/I]: `src/Infrastructure/IfcCustomViewSettings.js:30-41`
calls `api.CreateIfcGuidToExpressIdMapping` and then reads
`api.ifcGuidMap.get(modelID)`. Under the Conway shim that mapping is not
implemented, so GlobalId-keyed view settings (e.g. through the WidgetApi
`ChangeViewSettings` handler) likely throw. Not traced at runtime.

### B2. Smallest useful slice [I]

**A record-level splice writer**, Conway-side, TypeScript only.
`writeStep(model, overlay)` copies the header and every untouched record
verbatim by its byte span, substitutes replaced records, drops tombstoned ones
and appends new records before `ENDSEC;`. It writes to a chunked sink (OPFS),
so PSB-class files never need a second full copy in memory. It needs a STEP
value encoder: strings (including `\X2\…\X0\` escaping, the inverse of
`step_string_parser.ts`), reals (always with a `.`), `.ENUM.`, `#ref`, `$`, `*`,
typed selects like `IFCLABEL('x')`, and lists.

Slices, in order of value:

1. **Attribute and pset values.** Splice `Name` / `Description` /
   `ObjectType` / `Tag`; replace `IfcPropertySingleValue.NominalValue`.
   **Copy-on-write is mandatory** when an `IfcRelDefinesByProperties` has
   several `RelatedObjects`: mint a new pset, property and rel, and rewrite the
   old rel's list. Maps to `setProperty`.
2. **Placements.** Mint a new `IfcCartesianPoint`, `IfcDirection` ×2,
   `IfcAxis2Placement3D` and `IfcLocalPlacement` (keeping `PlacementRelTo`) and
   splice the element's `ObjectPlacement`. Never mutate a shared placement in
   place. Maps to `transform`.
3. **New extruded products** (Tier 1 `create`). A closure template: the
   product (class + GlobalId), `IfcLocalPlacement` → `IfcAxis2Placement3D`,
   `IfcProductDefinitionShape` → `IfcShapeRepresentation` (reusing the model's
   `Body` subcontext, `SweptSolid`), `IfcExtrudedAreaSolid` →
   `IfcRectangleProfileDef` / `IfcArbitraryClosedProfileDef`,
   `IfcRelContainedInSpatialStructure` to an existing storey, and optionally a
   pset and an `IfcStyledItem` for colour. `OwnerHistory` is mandatory in
   IFC2x3 (reuse one) and optional in IFC4/4x3. Delete is a tombstone plus a
   rewrite of the containing rel lists.
4. **Mesh products** (Tier 2 `create`): the same closure with
   `IfcTriangulatedFaceSet` (IFC4+) or `IfcFacetedBrep` /
   `IfcShellBasedSurfaceModel` (IFC2x3).
5. **STEP (AP214) export.** The splice writer is schema-agnostic, so edits and
   deletes work the same way; *creating* AP214 geometry needs a separate
   template set, and B-rep is out of reach. Defer.

Before export, a new element can be displayed either by meshing it in Share
(three `ExtrudeGeometry`, cheapest) or by emitting its closure into a tiny
standalone IFC buffer and running it through `parseDataToModel` and the normal
extraction. The second proves on every create that the records the writer
would export actually render, which makes it a natural test oracle.

### B3. GlobalId minting [I; the format is IFC-spec]

- A GlobalId is a 128-bit GUID compressed to 22 characters in `0-9A-Za-z_$`:
  the first character carries 2 bits, the rest 6 each.
- **Mint when the op is created** (`crypto.getRandomValues` or `randomUUID`,
  then compress; about 40 lines) and store it in the `create` op as the
  element's ref, so replay is deterministic and later ops resolve. Don't mint
  at replay or at export.
- A deterministic UUIDv5 over (source content key, op id) would also work, but
  ties identity to op ids, which breaks when a log is rebased or merged.
- Source elements keep their `e<expressID>` refs (the source is immutable).
  Created elements use the `g<GlobalId>` ref kind.
- Express ids for created records are allocated at export from
  `maxIndexedExpressID + 1` and never persisted.

### B4. Size [I]

| Piece | Lines, incl. tests |
|---|---|
| STEP value encoder | 250–400 |
| Splice writer, streaming sink, overlay model (tombstone / replace / append) | 300–500 |
| GlobalId mint/compress, express-id allocator | 80–120 |
| Slice 1: attribute splice, pset copy-on-write | 250–400 |
| Slice 2: placement copy-on-write | 150–250 |
| Slice 3: extruded-product templates (IFC2x3 + IFC4) | 300–500 |
| Round-trip harness (write → `parseDataToModel` → compare) | 200–300 |
| **Total** | **~1.5–2.5k** |

Slice 4 adds about 300 lines. The risk is not volume but **referential
correctness**: shared psets and placements, inverse relationships, and IFC2x3
versus IFC4 templates. The round-trip harness is where that gets paid down.


## Risks

1. **model-edit.md L0 is a hard prerequisite** for both tiers (post-load
   `addGeometry`, growable side tables, reused ids). It lands with #1915.
2. **Replay latency** for OpenSCAD elements (seconds for complex scripts, more
   for BOSL2 threads). Needs the derived-mesh cache and a pinned WASM version.
3. **Bundle weight:** 9.6 MB WASM plus ~1 MB of libraries, lazy-loaded behind
   the flag.
4. **Semantic poverty** of OpenSCAD output: one merged mesh, no parts, class
   and psets entirely from the agent, mesh-only IFC export. Tier 1 extrusions
   are the semantically honest path.
5. **Sovereignty leak through the inspection loop.** Renders default to the
   created element in isolation; anything showing the user's model surfaces in
   "what the AI can see".
6. **Writer correctness on shared records.** A naive in-place patch silently
   edits many elements; copy-on-write and per-schema templates are required.
7. **CADAM's upstream momentum is falling** (2 commits in Sep-26, one dominant
   author): another reason to borrow rather than depend.


## Not verified

Inferred, not checked in source: the ranking, the two-tier recommendation and
the payload shapes; every line and time estimate; the license-compatibility
conclusions; that lazy-union never yields per-part STL/OFF; the bundled
libraries' licenses; that `IfcCustomViewSettings` throws under Conway; and
replay latency (compile times were not measured).
