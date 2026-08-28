# Model Display Controls — Design

Status: Draft v0.1 (2026-07-29)
Owner: Pablo (with Claude).
Epic: `view-140` (new — see roadmap §4.2).
Related: [`viewer-replacement.md`](viewer-replacement.md) §3b (batched path,
GLB cache shape), [`glb-model-sharing.md`](glb-model-sharing.md) (artifact +
view-state round-trip), [`demand-tiled-rendering.md`](demand-tiled-rendering.md)
§B2 (the residency control this generalizes),
[`step-occurrence-selection.md`](step-occurrence-selection.md) (the scope
vocabulary).

This doc plans five asks that arrived together as "model display control":

1. **Auto-coloring is invisible and irreversible.** PR #1626 repaints colorless
   STEP/CAD models from a palette. It's default-on, has no UI, and the user
   can't tell it happened or turn it off.
2. **Wireframe** as an alternative shading mode, in the same control area.
3. **Scoped application** — display settings applied to a selection: whole
   model, a NavTree sub-tree, a leaf part, an individual mesh.
4. **Residency for every format**, not just IFC+STEP. It's gated on the batched
   path today for memory reasons, but it's useful generally — notably on the
   cached GLB we build from IFC/STEP.
5. **Display state in permalinks**, so a shared link reproduces what the sender
   was looking at.

They are one feature. Each is "an appearance decision, applied to a scope,
that should survive a share." The doc's central claim is that building them as
one **display-override stack** is materially cheaper than building five
controls, and that two of the five (1 and 4) are blocked on data we currently
throw away.

**Assumptions taken** (flagged for reversal, not settled by discussion):
- New epic `view-140` rather than growing `view-130`/`view-200`.
- One hash token `#d:` carries display state *and* view-200's hidden-element
  list (#1250) — see §6.3.
- Ships behind `?feature=displayControls` (default off), with the
  auto-color toggle the one piece that goes default-on early (§7, S2) since it
  makes existing default-on behavior discoverable rather than adding behavior.


## 1. What's there today

| Piece | Where | Shape |
|---|---|---|
| Auto-color | `src/viewer/ifc/productPalette.js` | `applyProductPalette(batches)` at assemble time, gated on `autoColorParts` (default on) |
| Residency slider + priority metric | `src/Components/Residency/ResidencyControl.jsx`, `src/viewer/residency/ResidencyController.js` | Popover on the "eyeball" button in `ElementsControl`; BatchedMesh-only |
| Hide / Isolate / Show-all | `src/Components/ElementsControl.jsx` + `IfcIsolator` | Store: `hiddenElements`, `isTempIsolationModeOn`; not URL-persisted (#1250) |
| Selection scopes | `NavTreeSlice` | `selectedElement`, `selectedElements` (expressIDs), `selectedInstanceIds` (synthetic per-`PlacedGeometry`), occurrence paths for STEP |
| Subset construction | `batchedSubset.js`, `IfcInstanceMap`, `elementSubsets` | Three routes to "a `Mesh` covering these elements", one per model shape |
| Hash tokens | `src/Components/*/hashState.js` | `c` camera, `cp` cut planes, `i`/`ic` notes, `m` placemark, `n` nav-tree, `p` properties, `s` search — `d` is free |

Two findings change the shape of the work:

### 1.1 Auto-color is destructive

`applyProductPalette` writes the palette color into `batch.instanceColors[i]`
— the *restore table* `batchedHighlight` reads to un-highlight — and into the
live buffer via `setColorAt`. The source color is then gone from memory. A
"turn auto-color off" toggle has nothing to restore to.

Fix: keep the source colors. `instanceSourceColors` (a parallel table written
once at assemble time, before any override runs) becomes the base layer of the
override stack, and `instanceColors` becomes what's currently displayed. This
is small, but it is a **prerequisite for ask 1** and it is the first story.

### 1.2 The palette is baked into the GLB cache

`batchedToMergedMesh` colour-bins from `mesh.instanceColors` (line ~97) into
`geometry.groups[]` + materials, and that is what gets exported. So the cached
GLB carries the *palette*, not the source grey. On a cache hit, "auto-color:
off" is unimplementable — the grey no longer exists anywhere.

Two ways out:

- **(a) Carry source colors in the artifact.** A `BLDRS_source_colors`
  extension alongside `BLDRS_face_ids`. Costs a schema bump, artifact size, and
  a second color table to keep consistent.
- **(b) Don't bake the palette; re-derive it on read.** Export the *source*
  colors, and have the reader re-run the palette. The palette is a pure
  function of the distinct geometry-id set (`assignPartColors` is deterministic
  over sorted distinct keys), and the geometry ids already round-trip in
  `BLDRS_face_ids`. No schema bump, no size cost, and cache-hit and cache-miss
  produce the same two-layer state.

**Recommend (b).** It also fixes a latent bug: today a cache-hit model is
palette-colored even if the user later turns the flag off, because the flag
only guards the assemble-time call.

Cost of (b): the exported GLB of a colorless STEP is grey when opened in a
generic GLTF viewer. That is arguably correct — the palette is Share's display
decision, not the model's data — but it is a visible change to the artifact and
worth confirming before implementing.

**Decision (2026-07-29): (b) is deferred to the batched-native GLB, NOT done
in S1.** S1 as shipped makes the palette reversible *in memory* (the
`instanceSourceColors` snapshot) — enough for the live cache-miss path S2's
control runs on. It deliberately does **not** touch the export or the reader,
so today a cache-hit GLB still bakes the palette and reload comes back grey-
free but non-reversible, with no Display menu (the menu gates on the batched
tables a merged reload lacks — §5). Reason: (b)'s read half — re-derive the
palette onto the *merged* reload without regressing it to grey — needs the
same merged-mesh recolor primitive as a merged residency backend, and §5 flags
that primitive as a **bridge that the `EXT_mesh_gpu_instancing` batched-native
GLB cache (`viewer-replacement.md` §3b.v) deletes**. Rather than write throwaway
recolor code that also can't be exercised by a GLB round-trip in a flow test,
display-controls-on-reload (color *and* residency) is folded into the
batched-native GLB work under `view-130`: when reload returns a real
`BatchedMesh`, S1's snapshot + S2's control light up on it unchanged, and the
export just needs to bake source colors so the snapshot has something to hold.
Until then, cache-hit reload is display-control-less by design, not by bug.


## 2. The model: a display-override stack

```
DisplayOverride = {scope, appearance}

scope = {kind, ref}
  kind: 'model' | 'subtree' | 'element' | 'occurrence' | 'mesh'
  ref:  —              | occurrencePathKey | expressID | occurrencePathKey | mesh uuid/name

appearance = {
  color?:    'auto' | 'source' | '#rrggbb',
  shading?:  'shaded' | 'wireframe' | 'shadedEdges',
  opacity?:  0..1,
  hidden?:   boolean,
  residency?: {percent: 0..100, metric: 'occupancy'|'memory'|'distance'},
}
```

Resolution is **last-writer-wins by specificity**: `model` < `subtree` (longer
occurrence path wins over shorter) < `element` / `occurrence` < `mesh`. Every
axis resolves independently — setting wireframe on a sub-tree doesn't reset the
model-level color choice.

Lives in a new `DisplaySlice` (store) + `src/viewer/display/DisplayController.js`.
The controller owns *when* to re-apply (selection change, model swap, override
push/pop) and delegates *how* to a per-model-shape backend (§5).

Why a stack rather than per-object mutation: it's the only structure that makes
ask 5 tractable. A permalink has to serialize a *decision*, not a scene diff —
"wireframe on this sub-tree" is 20 characters, the resulting per-instance state
is 28,674 booleans. It also makes reset trivial (pop to base) and gives the
conversational-CAD agent (T11 tool surface) a sane thing to call.

**Non-goal:** this is not a materials editor. `color: '#rrggbb'` is in the
schema because scoped solid-color is the obvious next ask and reserving the
slot is free, but no picker ships in this epic.


## 3. Color axis (ask 1)

Three values, one control:

- `auto` — the `productPalette` result. Default when the model is colorless
  (i.e. when `applyProductPalette` would have returned `true`).
- `source` — whatever the file said. For a colorless STEP that's the grey blob;
  for IFC/colored STEP it's identical to `auto`, and the control is a no-op the
  user can still see.
- `#rrggbb` — reserved (§2).

The control shows **which one is active**, which is the actual ask: today a
user seeing a rainbow jet engine has no way to learn that Share made that up.
Copy should say so — "Auto (Share-assigned)" beats "Auto".

Implementation once §1.1 lands: `color: 'source'` copies `instanceSourceColors`
→ `instanceColors` + `setColorAt`; `color: 'auto'` re-runs `assignPartColors`
over the scope's key set and writes that. Both go through the same
`batchedHighlight`-compatible path, so selection/hover restore correctly under
either.

**Scoped auto-color has a wrinkle worth naming:** the palette assigns by dense
index over the *sorted distinct parts of the set it's given*. Run it over a
sub-tree and that sub-tree's parts get colors 0..n — different colors than the
same parts had under whole-model auto-color. Two options: (i) always compute
the palette over the whole model and let a scope select a subset of that
assignment (stable, recommended), or (ii) compute per scope (more separation
within a small sub-tree, colors jump when scope changes). Recommend (i);
stability across scope changes is worth more than local contrast.


## 4. Shading axis (ask 2)

`wireframe` is not a per-instance property. `THREE.Material.wireframe` is
per-material, and a `BatchedMesh` draws all its instances with one material.
So there are two backends and the scope decides which:

- **Whole-model scope → material flag.** Set `wireframe = true` on each batch
  material. One line, exact, free. Covers the common case.
- **Sub-model scope → subset overlay.** Build a subset `Mesh` for the scope
  through the existing machinery (`batchedSubset.createSubsetMesh*` on the
  batched path, `IfcInstanceMap.createSubsetMeshByInstance` on the merged
  path), render it with a wireframe material, and **evict the shaded instances
  for that scope** (`setVisibleAt(false)` — the exact primitive the residency
  controller already uses). Eviction is what avoids z-fighting the opaque
  original; the same reason `batchedHighlight` recolors in place rather than
  overlaying (see `batchedSubset.js` header).

This is the reason ask 2 and ask 3 are one story-cluster and not two: scoped
wireframe *is* subset-construction plus eviction, and both already exist.

`shadedEdges` (solid + `EdgesGeometry` line overlay) is the mode most CAD users
actually mean when they say wireframe, and the overlay path above gives it for
the cost of a different material. Proposed as a third option in the same radio
group, not a separate story.


## 5. Residency for every format (ask 4)

`ResidencyController` requires `isBatchedMesh` + `instanceGeometry` +
`setVisibleAt`, so it renders nothing outside `?feature=batchedMesh` IFC/STEP.
`ResidencyControl` self-gates on `instanceCount > 0`, which is the right shape
— it just needs more ways to count.

Extract a backend interface:

```
ResidencyBackend {
  units: [{center, radius, bytes, ref, visible}]   // ref = whatever setVisible needs
  setVisible(unit, boolean)
  commit()                                          // for backends that batch work
}
```

Three implementations:

| Backend | Covers | Eviction primitive | Cost |
|---|---|---|---|
| `BatchedResidencyBackend` | Conway-direct batched (today's path) | `setVisibleAt` | O(1), free — ships already |
| `SceneGraphResidencyBackend` | Multi-node GLB, OBJ groups, BLD, STL/PDB/XYZ scenes | `Object3D.visible = false` | O(1) per node; trivial |
| `MergedResidencyBackend` | **Cache-hit GLB from our IFC/STEP export** — one merged `Mesh` | index-buffer compaction over `IfcInstanceMap.instanceIdToTriangleIndices` | O(triangles) per apply — needs care |

The merged backend is the one that matters for ask 4 and the one with a real
cost problem. `IfcInstanceMap` already stores per-instance triangle ranges
(contiguous in emission order, materialized as index lists), so the data is
there; hiding a set of instances means rewriting the index buffer to exclude
their triangles. At PSB scale that's not a per-slider-tick operation.

Mitigation: split the slider into **drag** and **commit**. During drag, show
the count and a cheap proxy (the merged backend can do nothing, or fall back to
a coarse `setDrawRange` on the tail); on `onChangeCommitted`, do the one real
compaction. The batched and scene-graph backends ignore the distinction and
stay live. `ResidencyControl` needs a `backend.isLive` flag to decide whether
to show a "release to apply" affordance.

**The strategic answer makes the merged backend obsolete.** viewer-replacement
§3b.v already plans an `EXT_mesh_gpu_instancing` batched-native GLB cache: if a
cache hit restores a `BatchedMesh` instead of a merged `Mesh`, the batched
backend covers it for free and the artifact shrinks. The merged backend is a
bridge. Worth building the bridge anyway — it also covers third-party GLBs
that happen to carry `_EXPRESSID`, and it's the only way ask 4 lands before
§3b.v — but the story should be written knowing it has a sunset.

Also: once residency is an axis of `appearance` (§2), the whole-model slider is
just `{scope: model, residency: {...}}`, and per-sub-tree residency ("keep this
wing resident, evict the rest") falls out. That's a genuinely new capability,
not a refactor artifact, and it's the thing that makes residency a *display*
control rather than a memory knob.


## 6. Permalink (ask 5)

### 6.1 Token

New prefix `d` (free — see §1 table), following the `cp:` convention
(`utils/location` `addHashParams`/`getHashParams`, keyed `k=v` pairs joined by
`,`, tokens joined by `;`).

```
#d:<term>[,<term>]*

term      := global | scoped
global    := color=auto|src | wire=0|1|edges | res=<pct>[.<metric>] | hide=<ids>
scoped    := <scopeRef>=<flags>
scopeRef  := e<expressID> | o<occurrencePathKey> | m<meshIndex>
flags     := compact letters: c=a|s, w=0|1|e, r=<pct>, h=1
```

Example: `#c:-136,37,62,-43,15,-4;d:color=src,wire=1,o3.7.2=w0`
— whole model in source colors and wireframe, one sub-tree back to shaded.

Only non-default terms serialize; a model in its default state contributes no
token at all. That keeps the common share link exactly as short as it is today.

### 6.2 Size cap

A per-element override list is unbounded and URLs are not. Cap the token
(proposal: ~1.5 kB / ≲32 scoped terms). Past the cap, the model-scope terms
still serialize, scoped terms are dropped, and the user gets a snackbar saying
the link carries the overall look but not the per-part edits.

The durable home for a large view state already exists in the plan:
glb-model-sharing §"Round-trippable Notes & Versions" — named view states
(camera + cut planes + visibility) in the artifact, T2 Phase 4. Display
overrides are the same kind of object and should ride the same v0.1 view-state
schema. **This epic should define the display-override schema so T2 Phase 4 can
embed it verbatim**, and the URL token is then the compact projection of it.

### 6.3 Relationship to #1250

view-200's remaining slice is URL-encoding `hiddenExpressIDs[]`. Hidden is an
appearance axis on a scope; that's the same serializer, the same scope
vocabulary, and the same size cap. Recommend one token carries both
(`hide=`/`h=1` above), and #1250 becomes a slice of S6 rather than an
independent issue. If they stay separate, the two parsers will drift on scope
syntax the first time STEP occurrence paths need encoding.


## 7. Epic + stories

**Epic `view-140`: Scoped display controls + shareable display state.**
Sub-issues, all sharing the epic name per CLAUDE.md §"UI work" / conversational-cad
§7.1, each needing a `describeMobileAndDesktop` happy-path E2E before it closes.

| # | Story | Content | Depends on |
|---|---|---|---|
| S1 | Source-color preservation (in memory) | `instanceSourceColors` snapshot at assemble time; palette reversible on the live batched path. No UI. **Shipped.** The export/reader half of §1.2b (bake source, re-derive on read) is NOT in S1 — see §1.2's 2026-07-29 decision; it moves to S9. | — |
| S9 | Display controls on cache reload | Bake source colors into the GLB and light up color + residency on reload — via the `EXT_mesh_gpu_instancing` batched-native cache (§3b.v) so reload returns a `BatchedMesh` and S1/S2/S6 all apply unchanged, rather than a throwaway merged recolor backend. **Landed behind `?feature=glbBatched` (default off):** S9a writer (`glbBatchedExport` + `BLDRS_instance_tables`, own schema slot `0.15.0-batched`), S9b reader (`instancedGlbToBatchedModel` + the shared `decorateBatchMeshes` core, so cache-hit behavior IS cache-miss behavior), S9c round-trip tests. Risk checks: 1 (schema gate) + 4 (third-party appearance) pinned in `glbCompress.test.js` / `glbBatchedExport.test.js`; 2 (parity) + 3 (determinism) in `glbBatchedRoundTrip.test.js`, which runs writer → real GLTFLoader → hydrate in jest. The MISS→HIT **E2E now runs** (`src/loader/batchedGlbCache.spec.ts`, desktop + mobile) — `OPFS_IS_ENABLED` was flipped true in the playwright build (Share#1783), so the OPFS hop is under CI too. It asserts parity keyed by instance IDENTITY (occurrence path), not by `batchId`: the writer groups instances by (geometry × source color) and the reader re-adds them group by group, so a HIT's batchIds run in artifact-node order where a MISS's run in Conway's emission order. Same instances, same colors, different indices — batchId is not a cross-cache identity and nothing addresses one. *(→ `view-130`; it's the batched-GLB perf item.)* | S2, §3b.v |
| S2 | Color control | Display section in the eyeball popover: Auto (Share-assigned) / Source. Model scope. **Default-on** — makes existing behavior discoverable. | S1 |
| S3 | Display-override stack | `DisplaySlice` + `DisplayController` + specificity resolution; S2's toggle re-homed onto it. Behind `?feature=displayControls`. | S2 |
| S4 | Shading control | Shaded / Wireframe / Shaded+edges. Whole-model material fast-path only. | S3 |
| S5 | Scoped application | Sub-tree / element / occurrence / mesh scopes; subset-overlay wireframe backend (§4); NavTree row affordance + selection-scoped menu. | S4 |
| S6 | Residency backends | Backend interface; scene-graph + merged backends; ungate the control for GLB/OBJ/etc; drag-vs-commit. *(→ `view-130`, not `view-140` — it's the perf control.)* | S3 |
| S7 | Permalink | `#d:` token, round-trip, size cap + degrade; absorbs #1250. **Landed model-scope first** (color + shading, then residency) ahead of S5 — model-scope axes can round-trip now, it's pure serialization (no scene-interaction risk), and it makes S1–S4 shareable. Residency joining the token is what forced its state out of `ResidencyControl`'s local `useState` and into the override stack (`{percent, metric}` on the `residency` axis), so the whole Display menu is now stack-backed; see `viewer/display/residencyMode.js` for why the stack — not the scene — is the authority on that one axis. The token grammar is forward-compatible: scoped terms (`e<id>=`/`o<key>=`/`m<idx>=`) and `hide=` widen the same `d:` token when S5 + the hidden-list land, no grammar change for what's written today. Size cap + degrade apply once scoped terms exist. | (model-scope) S4; (scoped) S5 |
| S8 | Docs | This doc's decisions folded back; roadmap rows; wiki Design:URLs `#d:` entry. | S7 |

Sequencing note: S1 → S2 is worth landing on its own before the rest. It closes
ask 1 (the one with a user-visible correctness smell) in two small PRs, and S1
is a prerequisite no matter which way the rest of the design goes.


## 8. Test plan

Following the residency-slider precedent (`src/tests/e2e/residencySlider.spec.ts`),
the E2E assertions read **scene state, not DOM state** — a control that lights
up but doesn't change pixels is the failure mode that matters here.

- Unit: palette reversibility (source → auto → source is identity, exactly);
  override-stack specificity resolution; token round-trip (parse ∘ serialize =
  identity) including the cap-and-degrade path.
- E2E per story, desktop + mobile: color toggle changes `instanceColors`;
  wireframe sets `material.wireframe` (model scope) / produces an overlay with
  the shaded instances evicted (sub-model scope); residency control *appears*
  on a GLB and an OBJ and actually reduces visible units; a permalink with a
  `#d:` token reproduces the scene state cold.
- Regression: `?feature=displayControls` off ⇒ the bottom bar is unchanged
  (screenshot invariant, matching the `workspace` flag precedent).


## 9. Open questions

1. **GLB artifact color** (§1.2). Exporting source colors instead of the
   palette makes Share's cached GLB grey in third-party viewers. Correct, but
   confirm it's wanted before S1 implements it.
2. **Epic placement.** `view-140` assumed. The alternative is growing
   `view-200` (visibility → appearance), which has the merit that #1250 is
   already there.
3. **One token or two** (§6.3). Assumed one.
4. **Auto-color default when scoped.** Whole-model palette assignment with
   scope-as-filter (recommended) vs per-scope recompute (§3).
5. **Does residency belong in the same menu?** Screen 4 puts the slider under
   the eyeball. Adding color + shading there makes one popover with three
   sections. Plausible alternative: eyeball = "how much do I see", a new
   swatch/appearance button = "how does it look". Recommend one popover with
   sections until it's crowded — the mobile screenshot suggests it's already
   close to the limit.
