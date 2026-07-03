# Bldrs Share Roadmap

**Status:** Draft v0.4 — AI-strategy synthesis folded in (quota axis, moat framing)
**Date:** 2026-07-03
**Owner:** Pablo
**Source baseline:** `Share Requirements` Google Doc (Aug 2021, last updated Nov 2022). PDF
extract preserved in this commit's history; key Epic list inlined in §4.

This doc normalizes the legacy Epic list against ~2 years of execution since the last
top-down review, surfaces the work that landed without story tracking, and lays out the
**Pro/billing-ready MVP** plan plus the loveable backlog beyond it.

**v0.3 (2026-07-02) folds in three things:**

1. **Implementation drift since v0.2** — the `conway-web-ifc-adapter` shim retired
   (`design/new/adapter-removal.md`), the GPU-instancing/`BatchedMesh` render arc
   behind `?feature=batchedMesh`, STEP metadata extraction (conway #345 arc), and
   the marketing site's move to Next.js SSG. Reflected in §3–§5.
2. **Growth-strategy reconciliation** — priorities re-cut against the funnel
   attribution work in `bldrs-ai/bizdev` `docs/growth-strategy.md`. That doc is
   **private** (spend, CAC, geo, raw traffic stay there — only qualitative
   conclusions and instrumentation *shape* are mirrored here). Headline
   conclusions: paid search is currently the only channel delivering real
   authored-model opens; organic discovery is effectively zero; shared links are
   the highest-quality earned traffic we have. Consequence: funnel
   instrumentation, SEO landing surfaces, and share-loop polish move from
   "post-MVP polish" into an active parallel phase — §4.10 (Grow), Track T9,
   §6 Phase G.
3. **The AI-workspace pivot** — the product direction after (and partly alongside)
   the Pro-MVP: a Claude-Code-like conversational workspace over CAD/BIM models,
   multi-user, with user-generated AI-app toolbelts. New Epic group §4.11
   (Assist), Tracks T10–T11, plan in §7. Several long-held loveables
   (`search-120`, `apps-130`, `apps-120`) are absorbed into it.

**v0.4 (2026-07-03)** reconciles against the AI-strategy synthesis
(`bldrs-ai/bizdev` `docs/ai-strategy.md` — **private**: MAU/revenue/fundraise
figures and competitor analysis stay there). The public-safe conclusions that
re-cut this roadmap:

- **Commodity/moat split.** Viewing *small* models is a commodity — free
  alternatives everywhere, near-zero willingness to pay. Handling *large,
  real-world* models client-side, fast, with a full structured IFC/STEP API is
  where Share is in a different class — and it's the substrate an interactive
  AI loop on real models requires. The engine is the foundation; **"AI iterates
  on models nobody else can even open"** is the headline (not "fastest
  viewer").
- **Quota by size/complexity, not model count.** Free tier keeps small models
  unlimited (the funnel is demand-gen); the paywall sits at the threshold where
  Share is the only thing that works. Phase D runs as an **instrumented
  experiment** with stated hypotheses, not a revenue switch. Reflected in
  `subscribe-100`/`subscribe-120` and Phase D.
- **Data sovereignty is a first-class feature.** "Runs in-browser, your model
  never leaves your machine" is an enterprise wedge, not a privacy nicety — and
  it constrains §7 architecture (the agent loop must not silently break the
  no-upload story). New epic `grow-130` for the positioning surface; §7.2 for
  the constraint.
- **De-prioritised:** chasing more cheap small-model traffic; "fastest engine"
  as headline positioning. Phase G stays (it's demand-gen + loop + measurement,
  all cheap) but doesn't grow beyond that.

It is the single source of truth for Epic/Story/Track structure. The wiki page
`Planning:-Requirements` and the `epic`-labeled GitHub issues mirror this doc; when they
disagree, this doc wins and the others get updated.


## 1. Approach

- **Epic** = verb-shaped product capability the user experiences (Open, View, Share,
  Search, …). Matches the PDF's organising shape. One epic per `epic`-labeled GH issue.
- **Story** = scoped user-visible feature with E2E (Playwright) coverage as the
  acceptance gate. One `story`-labeled GH issue per story; tasks live as checkboxes
  inside.
- **Track** = orthogonal subsystem rebuild (Viewer Replacement, GLB Sharing, Identity
  Decoupling, …). Tracks aren't Epics — they're infrastructure that unblocks multiple
  Epics at once. Each track has a long-form design doc in `design/new/`; this roadmap
  cross-references them but doesn't duplicate their content.

The original PDF interleaved capability lists and implementation notes. This doc keeps
them split: §3 is the master overview (one row per Epic and Track), §4 is the Epic
catalogue, §5 is the Track catalogue, §6 is the Pro-MVP sequencing across both, §7 is
the AI-workspace pivot plan, §8 is what's loveable but post-MVP.


## 2. Status legend

| Symbol | Meaning |
|---|---|
| ✔ | Done in production. Default-on. E2E covered (or follow-up E2E captured). |
| 🟡 | In flight — PR open, design doc landed, or substantial code written behind a flag. |
| ⬜ | Backlog — defined enough to start, not started. |
| 🔮 | Loveable / post-MVP — held over from PDF's 🥇/❤️ markers or new. |
| 🔒 | Pro gated — free users can see it exists but can't use the full capability. |

Per the PDF: 🥉 = MVP, 🥇 = MLP (Minimum Loveable Product), ❤️ = personal MLP. I preserve
those markers in §4 next to the original ranking so we don't lose the people-attached
intent. New work added since the PDF is marked `(NEW)`.

**Pro-MVP column legend** (used in §3 and §5):

- **A–E** = phase in the Pro-MVP plan (§6). A = stabilise viewer, B = identity +
  multi-account, C = sharing v1, D = subscribe + ads, E = launch checklist.
- **G** = growth-funnel phase (§6 Phase G) — runs **parallel** to A–C and starts
  now; small, high-leverage, mostly independent of the viewer/identity arcs.
- **AI** = AI-workspace pivot arc (§7) — sequenced after the Pro-MVP launch, with
  flagged foundations allowed to start earlier (see §7.4).
- **—** = already shipped; no Pro-MVP work pending.
- **Post** = held in §8 Post-MVP backlog.


## 3. Status overview

The master tables. Each Epic and Track lists status, Pro-MVP phase, and the
cross-references that connect them. The detailed bodies live in §4 (Epics) and §5
(Tracks).

### 3.1 Epics

| Verb | ID | Name | Status | Pro-MVP | Tracks |
|---|---|---|---|---|---|
| Open | `open-100` | Open from local file system | ✔ | — | — |
| Open | `open-110` | Open from GitHub URL / UI | ✔ | — | — |
| Open | `open-120` | Open from Google Drive | ✔ | — | — |
| Open | `open-130` | Multi-account Sources tab | 🟡 | B | T3 |
| Open | `open-140` | Open multiple IFCs in one session | ⬜ | Post | — |
| Open | `open-150` | Recents reliability | 🟡 | E | T5 |
| View | `view-100` | 3D + NavTree + Properties | ✔ | — | T1, T2 |
| View | `view-110` | Cut planes | ✔ | — | T1 |
| View | `view-120` | Shareable camera position | ✔ | — | — |
| View | `view-130` | Persistent visibility / Isolate | 🟡 | Post | T1 |
| View | `view-140` | Selection-based camera + measurement | ⬜ | Post | — |
| View | `view-150` | Performance + large-model viewing | 🟡 | A | T1, T2 |
| View | `view-160` | ETL / Table view (❤️ Markus) | 🔮 | Post | T1 |
| View | `view-170` | Common view ops (nav-cube, explode, undo, IDS) | ⬜ | Post | — |
| View | `view-180` | Placemarks + maps-style issues w/filtering (🥇) | 🟡 | C, Post | T1, T6 |
| Share | `share-100` | Share link to current view | ✔ | — | — |
| Share | `share-110` | Save model to user's hosting (originator share) | 🟡 | C | T2 |
| Share | `share-120` | Private link sharing + visibility chip | 🟡 | C | T4 |
| Share | `share-130` | Grant/revoke per-principal sharing | 🟡 | C | T4 |
| Share | `share-140` | Folder-scoped boundaries | ⬜ | Post | T4 |
| Share | `share-150` | Extended Share/Login flow (<a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>) | 🟡 | C, D | — |
| Notes | `notes-100` | Anchored notes (GitHub-backed) | ✔ | — | — |
| Notes | `notes-110` | BCF round-trip | ⬜ | Post | — |
| Notes | `notes-120` | Drive-backed notes (NotesProvider) | 🔮 | Post | T4, T6 |
| Versions | `versions-100` | Show specific version + branch/commit nav | 🟡 | — | — |
| Versions | `versions-110` | Diff between versions | ⬜ | Post | — |
| Versions | `versions-120` | Portable versions for Drive | 🔮 | Post | T6 |
| Search | `search-100` | Search current model | 🟡 | — | — |
| Search | `search-110` | Search across GitHub repos (❤️ Oleg) | 🔮 | Post | — |
| Search | `search-120` | Knowledge graph (🥇, ❤️ Johannes) | 🔮 | AI | T10 |
| Identity | `identity-100` | Auth0 primary login | ✔ | — | — |
| Identity | `identity-110` | GitHub as Sources peer | 🟡 | B | T3 |
| Identity | `identity-120` | Auth disambiguation (<a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a>) | 🟡 | B | — |
| Identity | `identity-130` | Profile drawer + multi-account picker | ⬜ | B | T3 |
| Apps | `apps-100` | Browse + select app (AppsDrawer) | ✔ | — | — |
| Apps | `apps-110` | XYZ demo app (v0.1 API dogfood) | ✔ | — | — |
| Apps | `apps-120` | Bldrs Integrate (CI + ArchiCAD/Speckle) | 🔮 | AI | T11 |
| Apps | `apps-130` | v1.0 Public API + IDE (🥇) | 🔮 | AI | T11 |
| Community | `community-100` | Welcome dialog + onboarding | ✔ | — | — |
| Community | `community-110` | Analytics + survey + thumbs feedback | 🟡 | E | — |
| Community | `community-120` | Bug report w/ screenshot + session state | ⬜ | Post | — |
| Community | `community-130` | AEC outreach (🥇) | 🔮 | Post | — |
| Subscribe | `subscribe-100` | Pricing tiers + feature manager (NEW) | ⬜ | D | T8 |
| Subscribe | `subscribe-110` | Stripe checkout + portal (NEW) | ⬜ | D | T8 |
| Subscribe | `subscribe-120` | Quota tracking (NEW) | ⬜ | D | T8, T3 |
| Subscribe | `subscribe-130` | Ads on free tier | 🟡 | D | T7 |
| Grow | `grow-100` | SEO format landing pages `/viewer/*` (NEW) | ⬜ | G | T9 |
| Grow | `grow-110` | Rich share-link previews / OG cards (NEW) | ⬜ | G | T9 |
| Grow | `grow-120` | Funnel instrumentation + GA hygiene (NEW) | ⬜ | G | T9 |
| Grow | `grow-130` | Large-model + data-sovereignty positioning (NEW) | ⬜ | G | T9 |
| Assist | `assist-100` | Workspace shell: left drawer projects + org nav (NEW) | ⬜ | AI | — |
| Assist | `assist-110` | Conversational agent panel, single-user (NEW) | ⬜ | AI | T10, T11 |
| Assist | `assist-120` | Multi-user channels + AI participation modes (NEW) | ⬜ | AI | T10 |
| Assist | `assist-130` | AI-apps toolbelt: save/version/run + MCP (NEW) | ⬜ | AI | T11 |

### 3.2 Tracks

| ID | Name | Status | Pro-MVP | Unblocks |
|---|---|---|---|---|
| T1 | Viewer Replacement | 🟡 | A (launch gate) | `view-100`, `view-110`, `view-130`, `view-150`, `view-160`, T2 |
| T2 | GLB Model Sharing | 🟡 | C (Ph 4 + 5) | `share-110`, `notes-120`, `view-150` |
| T3 | Identity Decoupling | 🟡 | B (PR2 + PR3) | `identity-110`, `identity-120`, `identity-130`, `open-130`, `share-130`, `subscribe-120`, T4 PR3 |
| T4 | Multi-User Sharing | 🟡 | C (PR2 + PR3) | `share-120`, `share-130`, `share-140`, `notes-120`, `versions-120` |
| T5 | Drive Recents HEAD-check | ⬜ | E (polish) | `open-150` |
| T6 | Notes & Versions sidecar formats | ⬜ | Post | `notes-110`, `notes-120`, `versions-120` |
| T7 | Ads | 🟡 | D | `subscribe-130` |
| T8 | Pro/Billing (NEW) | ⬜ | D | `subscribe-100`, `subscribe-110`, `subscribe-120`, §7 AI metering |
| T9 | Growth funnel & SEO surfaces (NEW) | ⬜ | G | `grow-100`, `grow-110`, `grow-120` |
| T10 | Agent runtime & conversation store (NEW) | ⬜ | AI (§7) | `assist-110`, `assist-120`, `search-120` |
| T11 | App sandbox + MCP bridge (NEW) | ⬜ | AI (§7) | `assist-130`, `apps-130`, `apps-120` |


## 4. Normalized Epic catalogue

Each Epic block: heading with stable ID; one-sentence purpose; status; legacy reference
in italics; closed stories (with GH numbers); open stories; gaps relevant to the
Pro-MVP; relevant tracks from §5.


### 4.1 Open

User can open a model from local, cloud, or shared link, with format breadth and
multi-model composition.

**Epic `open-100`: Open from local file system** ✔
*PDF Open.1 — done in PDF.* Still done. Drag-and-drop and file picker both wire to the
loader. Recent stability work via OPFS caching (`src/OPFS/`) and Conway-direct parse
(Track T1).
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/757" target="_blank" rel="noopener noreferrer">#757</a> Open sample model, <a href="https://github.com/bldrs-ai/Share/issues/934" target="_blank" rel="noopener noreferrer">#934</a> DnD-to-update.
- No open stories; capability is steady-state.

**Epic `open-110`: Open from GitHub URL / UI** ✔
*PDF Open.2 (the open-the-model half).* Done.
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/765" target="_blank" rel="noopener noreferrer">#765</a> GH URL, <a href="https://github.com/bldrs-ai/Share/issues/1159" target="_blank" rel="noopener noreferrer">#1159</a> GH via UI, <a href="https://github.com/bldrs-ai/Share/issues/1190" target="_blank" rel="noopener noreferrer">#1190</a> Tabbed Open dialog.
- Open: <a href="https://github.com/bldrs-ai/Share/issues/761" target="_blank" rel="noopener noreferrer">#761</a>/<a href="https://github.com/bldrs-ai/Share/issues/768" target="_blank" rel="noopener noreferrer">#768</a> file-browser polish — superseded by `open-130`.

**Epic `open-120`: Open from Google Drive** ✔ (NEW since PDF — Drive wasn't in the
original list; landed via `googleDrive` flag now default-on).
- Browse + open landed; `?feature=googleDrive` retired (default-on).
- Open: needs Drive Save (mirrors GitHub Save flow) — captured under `share-110`.
- Track dependency: T3 Identity Decoupling for the multi-account case.

**Epic `open-130`: Multiple sources / multi-account Sources tab** 🟡
*PDF didn't anticipate multi-account; absorbed from T3 Identity Decoupling.*
- Open: Drive multi-account works today; GitHub multi-account is the deliverable of
  T3's PR2/PR3.
- Story to file: `open-130: SourcesTab with parallel GitHub + Drive accounts`.

**Epic `open-140`: Open multiple IFCs in one session** ⬜
*PDF Open.3 — never started.*
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1251" target="_blank" rel="noopener noreferrer">#1251</a> Open 200: import and overlay multiple models.
- Pre-condition: Conway-direct + GLB cache are stable per-model (✔ via T1/T2), so
  scaling to N models is now a UI + state-management problem, not an engine problem.
- **Not in Pro-MVP.** Loveable post-MVP.

**Epic `open-150`: Recents reliability** 🟡 (NEW)
*Not in PDF — surfaced by support friction.*
- Track dependency: T5 Drive recents HEAD-check (proposed).
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1548" target="_blank" rel="noopener noreferrer">#1548</a> local recent fails hard after a cache clear — needs a typed
  "file no longer available" alert (T5's pre-flight pattern applied to the
  OPFS/local case, not just Drive).
- Story to file: `open-150: Recents show typed unreachable alert + remove-recent`.


### 4.2 View

User can inspect the model in 3D with the navigation, properties, search-by-element,
slice, and isolation controls expected of a BIM viewer.

**Epic `view-100`: 3D + NavTree + Properties** ✔
*PDF View.1 — done in PDF. Re-validated against Conway-direct + GLB cache.*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1031" target="_blank" rel="noopener noreferrer">#1031</a> Initial model load, <a href="https://github.com/bldrs-ai/Share/issues/1046" target="_blank" rel="noopener noreferrer">#1046</a> Synchronized View+NavTree, <a href="https://github.com/bldrs-ai/Share/issues/1042" target="_blank" rel="noopener noreferrer">#1042</a> Centering &
  reset, <a href="https://github.com/bldrs-ai/Share/issues/1242" target="_blank" rel="noopener noreferrer">#1242</a> Access properties of selected element, <a href="https://github.com/bldrs-ai/Share/issues/1048" target="_blank" rel="noopener noreferrer">#1048</a> Navigate by hierarchy.
- Open follow-up: NavTree on cache-hit GLB E2E spec (called out in
  `design/new/viewer-replacement.md` §3b.iii).
- Regression fixed (viewer-replacement era): scene↔NavTree selection sync +
  element-path permalinks. The default-on Conway-direct scene pick set store state
  directly, bypassing the `selectItemsInScene` funnel — so a NavTree selection inherited
  a stale per-instance highlight (scene stopped following the tree) and scene picks wrote
  no permalink. Fixed by funnelling every selection source through `selectItemsInScene`
  (now owns `selectedInstanceIds` + the URL path). Reactivated the `SynchronizedView` E2E
  (was `describe.skip`). Stories: <a href="https://github.com/bldrs-ai/Share/issues/1046" target="_blank" rel="noopener noreferrer">#1046</a> (sync) +
  <a href="https://github.com/bldrs-ai/Share/issues/1180" target="_blank" rel="noopener noreferrer">#1180</a> (permalinks).
- STEP occurrence-keyed selection + hide ✔ (NEW). For STEP / AP214 assemblies, one
  part type is reused across many occurrences (e.g. every as1 bolt shares one
  `product_definition_shape`), so the scalar-`expressID` selection key collapsed them
  all. NavTree↔scene selection and the hide/eye now key on the per-occurrence path
  (root→leaf NAUO ids from Conway's `PlacedGeometry.occurrencePath`), so a reused part
  selects, reveals-in-tree, and hides as a *single* occurrence — and it survives the GLB
  cache. Conway-side extraction is the `step-metadata` track (see Track T1 + conway's
  `step-metadata-nist.md`); Share-side design +
  remaining follow-ups (permalink encoding, per-occurrence isolate) in
  `design/new/step-occurrence-selection.md`. PRs #1573 + #1575, E2E over `as1-oc-214.stp`.
- STEP metadata: NavTree names + Properties 🟡 (NEW). Conway now extracts AP214/AP242
  product structure + properties and emits them through the `web-ifc` compat surface
  in the exact shapes Share consumes (conway #345 arc), so a STEP file lights up the
  NavTree + Properties panel with no Share code change. Share-side follow-through:
  <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a> (verify against the NIST corpus after the next Conway release bump;
  generalize the selection/permalink key to the occurrence path) and
  <a href="https://github.com/bldrs-ai/Share/issues/1570" target="_blank" rel="noopener noreferrer">#1570</a> (pin down the `{value}`-handle + reference-graph contract `ifclib`
  imposes on the engine; defensive `reifyName`; possible re-home to conway).
- Open bugs feeding Phase A stabilisation: <a href="https://github.com/bldrs-ai/Share/issues/1561" target="_blank" rel="noopener noreferrer">#1561</a> camera fit keys off "last scene
  child" instead of a named primary-model reference; <a href="https://github.com/bldrs-ai/Share/issues/1545" target="_blank" rel="noopener noreferrer">#1545</a> `getSelectedElementsProps`
  passes an expressID where a type code is expected (wrong/empty type in the
  Properties panel); <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a> (critical) selection/properties don't hydrate when a
  private model is opened from an element permalink.

**Epic `view-110`: Cut planes** ✔
*PDF View.3 — Cut sub-item ✔.*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1106" target="_blank" rel="noopener noreferrer">#1106</a> View 100 Cutplanes.
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1045" target="_blank" rel="noopener noreferrer">#1045</a> View 200 surface-aligned cut-plane UI. **Post-MVP polish.**
- Track dependency: T1 (unified Clipper landed).

**Epic `view-120`: Shareable camera position** ✔
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1043" target="_blank" rel="noopener noreferrer">#1043</a> View 100 Shareable camera position.
- Open: dropdown-share-button details from <a href="https://github.com/bldrs-ai/Share/issues/1043" target="_blank" rel="noopener noreferrer">#1043</a> (QR code, toggle camera) — see also
  `share-100` below.

**Epic `view-130`: Persistent visibility / Isolate** 🟡
*PDF "View element subsets" — partial.*
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a> View 200 Implement persistent visibility (URL-encoded
  `hiddenExpressIDs[]`).
- Track dependency: T1 §3b.iii isolate routing through IfcInstanceMap (landed).
  Persistence to URL is the remaining slice.

**Epic `view-140`: Selection-based camera + measurement** ⬜
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1044" target="_blank" rel="noopener noreferrer">#1044</a> View 200 Selection-based camera control; <a href="https://github.com/bldrs-ai/Share/issues/1047" target="_blank" rel="noopener noreferrer">#1047</a> View 200 Distance
  measurement between elements.
- **Post-MVP.** Useful for the loveable target but not blocking.

**Epic `view-150`: Performance and large-model viewing** 🟡
*PDF View "design" section — loaded model is stored/cached for fast re-open;
multi-worker; etc.*
- Closed (effectively, via Tracks T1 + T2): OPFS cache, GLB cache, Conway-direct,
  per-instance picking, perf monitor (`?feature=perf`), DRACO compression unblocked.
- Landed since v0.2:
  - **Adapter removal ✔ (2026-06).** The `conway-web-ifc-adapter` shim is retired;
    Share depends on `@bldrs-ai/conway` directly via the `@bldrs-ai/conway/web-ifc`
    subpath export, and the release chain collapsed to Conway → Share (no more
    three-hop republish / 22-minor-version lag). Real-`web-ifc` engine-swap
    comparison retained. See `design/new/adapter-removal.md`.
  - **GPU-instancing arc 🟡 (behind `?feature=batchedMesh`).** Grouper + measured
    analysis (#1568: ~60% vertex-memory reduction on instancing-dense Revit models,
    ~26% on STEP), `BatchedMesh` render path with recolor-based highlight, isolate,
    and BVH picking (#1571), and a batched→merged GLB-cache bake so cached
    artifacts stay byte-compatible with the merged reader (#1574). Always-on flip
    deferred pending smoke-test. See `viewer-replacement.md` §3b.iv.
- Open: on-demand rendering (dirty-flag, currently 60Hz unconditional — `viewer-
  replacement.md` §3c.iv "Open perf items"); hover-pick throttling tuning; per-product
  Mesh emission spike; `batchedMesh` always-on flip + per-occurrence selection
  narrowing on the batched path; `EXT_mesh_gpu_instancing` batched-native GLB cache
  (§3b.v) so the round-trip stays instanced and the artifact shrinks.
- Pre-public-launch gate: 4-angle screenshot harness + GLB bit-level diff (called out
  in `viewer-replacement.md` §3b.iii final paragraph). **Required for Pro-MVP.**

**Epic `view-160`: ETL / Table view / element subsets** 🔮 (❤️ Markus)
*PDF View.2 — never started.*
- The original loveable: select a model subset, choose attributes (psets, geometry,
  location), export CSV or stream to an API. Mapping tables across projects.
- Pre-condition: T1 `IfcModelService` query surface — once `idsByType`,
  `getItemProperties`, `getPropertySets` are all routed through the Conway-direct
  service (mostly done), the ETL layer is a UI-level Epic on top.
- **Post-MVP loveable.** Markus is the design partner here.

**Epic `view-170`: Common view operations** ⬜
*PDF View.3 — partially done (Cut ✔). Still missing:*
- Nav-cube, Explode, undo/redo.
- IDS (was MVD) — quality-check rules for the IFC. Discussed in PDF page 4–5.
- **Post-MVP.** IDS is a non-trivial spec implementation.

**Epic `view-180`: Placemarks + maps-style view of issues w/filtering** 🟡
*PDF View.4 (🥇 MLP). Placemarks are the in-scene-pin primitive on which the
loveable maps-style filtering visualization will sit. The PDF treats them as one
Epic and we keep that pairing here.*

The placemark primitive has two creation modes:
- **Transient** — created in-app, lives only in the URL hash (`#m:x,y,z`), no
  backing storage. Sharable as a bare permalink. This mode is why Placemarks
  belongs under `view-180` rather than `notes-*` — the primitive doesn't require
  Notes (or any storage layer) to exist.
- **Anchored to a Note** — persisted via the GitHub Issue store; the note's
  share-URL carries the placemark hash so the recipient lands on the pin with
  the discussion open.

Many future features will cross-cut both modes (filtering, clustering, search-by-
placemark, etc.).

The Epic splits into two layers — the primitive (substantial work landed) and the
visualization on top (post-MVP loveable):

- **Placemark primitive — 🟡 substantial work landed.** In-scene icon at `x,y,z`
  with hash-token `#m:x,y,z` carrying through permalinks; multiple placemarks
  supported, one active at a time. Wired into Notes for anchored discussions.
  Lives at `src/Infrastructure/PlaceMark.js` (~317 LOC) +
  `src/Components/Markers/` (~620 LOC). Behind `?feature=placemark` flag
  (not default-on). Wiki: [Design:URLs §placemark-token](https://github.com/bldrs-ai/Share/wiki/Design:-URLs#placemark-token).
  - Closed: <a href="https://github.com/bldrs-ai/Share/issues/599" target="_blank" rel="noopener noreferrer">#599</a> PR1 (in-scene placemark + state token); cleanup waves since.
  - Open polish issues — all 🟡, mostly Note-anchor + URL-sync correctness:
    - <a href="https://github.com/bldrs-ai/Share/issues/928" target="_blank" rel="noopener noreferrer">#928</a> Review existing Placemark code.
    - <a href="https://github.com/bldrs-ai/Share/issues/929" target="_blank" rel="noopener noreferrer">#929</a> Placemark activation (sync placemark ↔ selected note).
    - <a href="https://github.com/bldrs-ai/Share/issues/930" target="_blank" rel="noopener noreferrer">#930</a> Share a note with a placemark (URL-sync bug — scene group out of
      sync when hash-shared link is opened cold).
    - <a href="https://github.com/bldrs-ai/Share/issues/931" target="_blank" rel="noopener noreferrer">#931</a> Delete a placemark from a note.
    - <a href="https://github.com/bldrs-ai/Share/issues/932" target="_blank" rel="noopener noreferrer">#932</a> Store placemark info in note footer (limit one per note; parse from
      body on create).
    - <a href="https://github.com/bldrs-ai/Share/issues/942" target="_blank" rel="noopener noreferrer">#942</a> Story: Research existing Placemarks code.
    - <a href="https://github.com/bldrs-ai/Share/issues/985" target="_blank" rel="noopener noreferrer">#985</a> Drop placemark to correct location when cut-plane active (today picks
      exterior surface even when interior is exposed).
    - <a href="https://github.com/bldrs-ai/Share/issues/998" target="_blank" rel="noopener noreferrer">#998</a> Centralize element-deselection functionality — placemark mode needs
      to deselect the current element because position is URL-driven; the
      deselection method is buried in CadView and breaks at depth.
  - Open consumer story: <a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a> Notes 200 Anchor a note to an element — the
    Notes-side UI flow for binding a placemark to a note (data path works,
    UI flow doesn't).
  - Track dependency: T1 follow-up — `PlaceMark.js` relocation to
    `src/viewer/three/PlaceMark.js` alongside `Components/Markers/`
    (organisational, low priority) per `viewer-replacement.md` §3c.iv slice 2.
- **Maps-style filtering UI on top — ⬜ not started.** The Google-Maps-ish
  filter chips + cluster rendering when there are many placemarks. Pre-condition:
  the placemark polish issues above closed + richer issue metadata (tags /
  categories on Notes) so filtering has meaningful axes. Pairs with T6 (notes
  sidecar formats) once notes carry richer anchor + tag data.

**Pro-MVP**: split.
- Placemark polish (<a href="https://github.com/bldrs-ai/Share/issues/929" target="_blank" rel="noopener noreferrer">#929</a>/<a href="https://github.com/bldrs-ai/Share/issues/930" target="_blank" rel="noopener noreferrer">#930</a>/<a href="https://github.com/bldrs-ai/Share/issues/931" target="_blank" rel="noopener noreferrer">#931</a>/<a href="https://github.com/bldrs-ai/Share/issues/932" target="_blank" rel="noopener noreferrer">#932</a>/<a href="https://github.com/bldrs-ai/Share/issues/985" target="_blank" rel="noopener noreferrer">#985</a>/<a href="https://github.com/bldrs-ai/Share/issues/998" target="_blank" rel="noopener noreferrer">#998</a>/<a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a>) is candidate for
  **Phase C** alongside Notes work in the share flow — sharing a model with a
  pin-anchored discussion is a strong demo, and the URL-sync bug (<a href="https://github.com/bldrs-ai/Share/issues/930" target="_blank" rel="noopener noreferrer">#930</a>) blocks
  the share-a-note flow today.
- Maps-style filtering UI itself is **Post-MVP loveable** (§8 item 10).


### 4.3 Share (split out of legacy Collab)

User shares a model, a view, a note, or a region with another user — privately or
publicly — and the recipient sees what was intended.

**Epic `share-100`: Share link to current view (anonymous, public)** ✔
*PDF Collab.1 — done in PDF.*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1043" target="_blank" rel="noopener noreferrer">#1043</a> Shareable camera position.
- Open: QR code wiring exists per <a href="https://github.com/bldrs-ai/Share/issues/1043" target="_blank" rel="noopener noreferrer">#1043</a> sub-tasks — verify in E2E.

**Epic `share-110`: Save model to user's hosting (originator-side persistence)** 🟡
*PDF Open.2 (the save half) + new "originator share" thread from T2.*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/887" target="_blank" rel="noopener noreferrer">#887</a> Versions 100 Save imported model (GitHub-only flow), <a href="https://github.com/bldrs-ai/Share/issues/980" target="_blank" rel="noopener noreferrer">#980</a> Versions 100
  Save model, <a href="https://github.com/bldrs-ai/Share/issues/905" target="_blank" rel="noopener noreferrer">#905</a>/<a href="https://github.com/bldrs-ai/Share/issues/904" target="_blank" rel="noopener noreferrer">#904</a>/<a href="https://github.com/bldrs-ai/Share/issues/907" target="_blank" rel="noopener noreferrer">#907</a> Save UI components + notification.
- Open: Drive-Save mirroring GitHub-Save (`GoogleDriveSave.ts` — flagged in
  `identity-decoupling-decisions.md` §"Adjacent work").
- Track dependency: T2 Phase 5 (originator share flow: drop IFC → GLB written
  locally → upload artifact to Drive/GitHub/Firebase → link).

**Epic `share-120`: Private link sharing + visibility chip** 🟡 (NEW)
*Not in PDF except as "Private hosting" sub-bullet under Open.1.*
- Track dependency: T4 Multi-User Sharing PR1 (landed: provider scaffolding + Drive
  adapter); PR2 (Drive Share dialog UI); PR3 (GitHub sharing adapter).
- Open: feature flag `sharing` is off; turn-on once PR2 lands.
- **Required for Pro-MVP** (private sharing is a paid feature per <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>).

**Epic `share-130`: Grant/revoke per-principal sharing** 🟡 (NEW)
*Not in PDF.*
- Track dependency: T4 PR2/PR3 (Share dialog People panel — invites people/teams).
- Open: same `sharing` flag as `share-120`.
- **Pro-MVP**: Pro feature.

**Epic `share-140`: Folder-scoped boundaries** ⬜ (NEW)
*Not in PDF.*
- Track dependency: T4 PR4 (route schema extension + in-app boundary enforcement).
- **Post-MVP.** Useful but not blocking the paid launch.

**Epic `share-150`: Extended Share/Login flow (one-click)** 🟡 (NEW)
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a> Share (200) Extended login flow — the dialog that picks between
  anonymous-public-5-day, free-public-long-term, Pro-private, etc. This is the
  surface where the Pro pricing tiers become visible.
- **Required for Pro-MVP** (it's where the upgrade prompt lives).


### 4.4 Notes & Versions (split out of legacy Collab)

User leaves comments anchored to model elements, replies in a thread, and can revisit
a specific version of the model.

**Epic `notes-100`: Anchored notes (Github-backed)** ✔
*PDF Collab.2 — done in PDF (issued as <a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a> etc.).*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1054" target="_blank" rel="noopener noreferrer">#1054</a> Access list, <a href="https://github.com/bldrs-ai/Share/issues/1055" target="_blank" rel="noopener noreferrer">#1055</a> Select note, <a href="https://github.com/bldrs-ai/Share/issues/1057" target="_blank" rel="noopener noreferrer">#1057</a> Edit, <a href="https://github.com/bldrs-ai/Share/issues/1058" target="_blank" rel="noopener noreferrer">#1058</a> Delete, <a href="https://github.com/bldrs-ai/Share/issues/1059" target="_blank" rel="noopener noreferrer">#1059</a>
  Create, <a href="https://github.com/bldrs-ai/Share/issues/1056" target="_blank" rel="noopener noreferrer">#1056</a> GH-issue link, <a href="https://github.com/bldrs-ai/Share/issues/978" target="_blank" rel="noopener noreferrer">#978</a> Comments on a note, <a href="https://github.com/bldrs-ai/Share/issues/1071" target="_blank" rel="noopener noreferrer">#1071</a> Share a note, <a href="https://github.com/bldrs-ai/Share/issues/1072" target="_blank" rel="noopener noreferrer">#1072</a>
  Access shared note.
- Open: <a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a> Notes 200 Anchor a note to an element — the Notes-side flow for
  binding a placemark to a note; data path works. The Placemark primitive and
  its open polish issues (<a href="https://github.com/bldrs-ai/Share/issues/928" target="_blank" rel="noopener noreferrer">#928</a>/<a href="https://github.com/bldrs-ai/Share/issues/929" target="_blank" rel="noopener noreferrer">#929</a>/<a href="https://github.com/bldrs-ai/Share/issues/930" target="_blank" rel="noopener noreferrer">#930</a>/<a href="https://github.com/bldrs-ai/Share/issues/931" target="_blank" rel="noopener noreferrer">#931</a>/<a href="https://github.com/bldrs-ai/Share/issues/932" target="_blank" rel="noopener noreferrer">#932</a>/<a href="https://github.com/bldrs-ai/Share/issues/985" target="_blank" rel="noopener noreferrer">#985</a>/<a href="https://github.com/bldrs-ai/Share/issues/998" target="_blank" rel="noopener noreferrer">#998</a>) are tracked under
  `view-180`.

**Epic `notes-110`: BCF round-trip** ⬜
*PDF Collab.2 — "GitHub then BCF at some point".*
- Never started. Round-trip BCF v2 (XML format) so issues authored in Bldrs are
  consumable in Solibri / Navisworks / Tekla and vice versa.
- **Post-MVP.** Strong for AEC industry credibility.

**Epic `notes-120`: Drive-backed notes (provider-neutral NotesProvider)** 🔮 (NEW)
*Not in original PDF; introduced in `multi-user-sharing.md` Stretch §Q1-Q4.*
- Track dependency: T4 Stretch (sidecar formats, NotesProvider abstraction).
- **Post-MVP**: Q1–Q4 of T4 Stretch arc.

**Epic `versions-100`: Show specific version + branch / commit navigation** 🟡
*PDF Collab.3 (MVP).*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/980" target="_blank" rel="noopener noreferrer">#980</a> Save model, <a href="https://github.com/bldrs-ai/Share/issues/1154" target="_blank" rel="noopener noreferrer">#1154</a> Show specific version.
- Open: <a href="https://github.com/bldrs-ai/Share/issues/850" target="_blank" rel="noopener noreferrer">#850</a> Versions 100 sha path (filtering to single-file commits unresolved); <a href="https://github.com/bldrs-ai/Share/issues/890" target="_blank" rel="noopener noreferrer">#890</a>
  Versions 200 Delete a version (UI + flow not landed).
- **Pro-MVP**: enough is done for free-tier; Delete + branch UX polish slot post-MVP.

**Epic `versions-110`: Diff between versions** ⬜
*PDF Collab table — "Showing Diffs?"*
- Never started; needs a structural-diff between two IFC versions.
- **Post-MVP.** Significant scope.

**Epic `versions-120`: Portable versions for Drive (Versions manifest)** 🔮 (NEW)
- Track dependency: T4 Stretch Q3.
- **Post-MVP.**


### 4.5 Search

User finds elements in the current model, across their repos, or across the building
data graph.

**Epic `search-100`: Search current model** 🟡
*PDF Search.1 (MVP).*
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1180" target="_blank" rel="noopener noreferrer">#1180</a> Search 100 Permalinks.
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1254" target="_blank" rel="noopener noreferrer">#1254</a> Search 100 Search model based on element name (highlighting in scene).
- Story to file: cover NavTree + scene highlighting under the same E2E.

**Epic `search-110`: Search across GitHub repos** 🔮 (❤️ Oleg)
*PDF Search.2.*
- Never started. Cross-repo search for "all walls with `LoadBearing=true` across my
  org's repos".
- **Post-MVP loveable.** Oleg is the design partner.

**Epic `search-120`: Knowledge graph / ask questions** 🔮 (❤️ Johannes)
*PDF Search.3 (🥇 MLP).*
- Never started. Natural-language QA over building data with citations back to the
  model.
- **Absorbed by the AI pivot (§7).** Natural-language QA over the model is the
  first-class job of the conversational panel (`assist-110`); the knowledge-graph
  substrate becomes its retrieval layer (Track T10). Johannes stays the design
  partner.


### 4.6 Identity & Account (NEW Epic group — implicit in PDF "Federated authentication")

User signs in, links data sources, and the system honors that even across primary-auth
changes (Google → GitHub or vice versa).

**Epic `identity-100`: Auth0 primary login** ✔
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1052" target="_blank" rel="noopener noreferrer">#1052</a> Profile 100 Login (initial); <a href="https://github.com/bldrs-ai/Share/issues/1070" target="_blank" rel="noopener noreferrer">#1070</a> Profile 100 Theme.
- Track dependency: none — Auth0 SPA SDK in place.

**Epic `identity-110`: GitHub as a Sources peer (not just primary)** 🟡
*New since PDF; full design in `identity-decoupling.md` + decisions doc.*
- Track dependency: T3 PR1 merged (provider scaffolding + Netlify Functions). PR2
  (SourcesTab integration) + PR3 (switchover + flag retire) open.
- Open: feature flag `githubAsSource` off.
- **Required for Pro-MVP.**

**Epic `identity-120`: Auth disambiguation across linked identities** 🟡
- Open: <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a> Auth Disambiguation — primary + linked stored in cookie; chooser surface
  for prior identities on next login.
- **Required for Pro-MVP** (otherwise users with two GH accounts can't tell what
  they're billed under).

**Epic `identity-130`: Profile drawer + multi-account picker** ⬜
- Implicit in T3 PR2 design.
- **Required for Pro-MVP** — the "Saving as X — GitHub" footer in the Save dialog
  (`identity-decoupling-decisions.md` §Q4).


### 4.7 Apps

Third-party (and dogfooded) apps add capabilities to Share via a stable API.

**Epic `apps-100`: Browse + select app (AppsDrawer)** ✔
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1282" target="_blank" rel="noopener noreferrer">#1282</a> Apps 100.
- Open: nothing immediate as a free-standing Epic — but the AppsDrawer + `WidgetApi/`
  iframe surface is the **seed of the AI-apps toolbelt** (`assist-130`, §7.2).
  <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> (iframe integration broken; its test suite disabled) graduates from
  dormant bug to pivot blocker — the sandbox foundation must work before anything
  is built on it (§7.4 AI.0).

**Epic `apps-110`: XYZ demo app (dogfood v0.1 API)** ✔
*PDF Apps.1 — done in PDF.*

**Epic `apps-120`: Bldrs Integrate (CI + ArchiCAD/Speckle)** 🔮
*PDF Apps.2.*
- Never started. Server-side IFC validation pipeline running IDS rules per commit
  (preview of view-170 IDS).
- **Absorbed by the AI pivot (§7):** agent-driven model checks become the delivery
  vehicle — an AI-app in the toolbelt (T11) rather than a bespoke CI product.

**Epic `apps-130`: v1.0 Public API + docs + IDE integration** 🔮
*PDF Apps.3 (🥇 MLP).*
- Never started as a programmatic surface; the `WidgetApi/` directory is the seed.
- **Re-scoped by the AI pivot (§7):** the public API's first consumers are the
  in-app agent and the AI-apps sandbox, so the surface is designed **MCP-first**
  (Track T11) — external IDE/embedding consumers and the internal toolbelt share
  one tool contract instead of us maintaining two APIs.


### 4.8 Community & Onboarding

User finds out about Bldrs, gets oriented, leaves feedback, and finds product help.

**Epic `community-100`: Welcome dialog + onboarding** ✔
- Closed: <a href="https://github.com/bldrs-ai/Share/issues/1285" target="_blank" rel="noopener noreferrer">#1285</a> About welcome dialog.

**Epic `community-110`: Analytics + survey + thumbs feedback** 🟡
*PDF Community.1 — analytics ✔, survey/feedback still open.*
- Google Analytics integrated via `gtagEvent` (visible in code; called from `CadView`,
  GLB pipeline, etc.).
- Open: 👍/👎 exit feedback widget; in-app Google Forms survey link.
- **Pro-MVP**: at least one feedback affordance is needed for the public launch.

**Epic `community-120`: Bug report w/ screenshot + session state** ⬜
*PDF Community.2 (MVP).*
- Never started. The closest seed is `?feature=perf` for diagnostics; structured bug
  capture + auto-redaction of model bytes is the missing piece.
- **Post-MVP** unless Pro-MVP support burden makes it Day-1 critical.

**Epic `community-130`: AEC outreach (Stack Overflow, Twitter)** 🔮
*PDF Community.3 (🥇 MLP — ❤️ Kate?).*
- Out of repo scope. Now owned by the bizdev growth-strategy doc (§7 there:
  community channels, Show HN, DevRel around git-based model versioning; channel
  prioritisation follows the private attribution data). Tracked here for
  completeness; the in-repo dependency is §6 Phase G instrumentation landing
  first so a traffic spike is measurable.


### 4.9 Subscribe (NEW Epic group)

User upgrades from free to Pro, the system tracks quota, and Pro-only features become
available.

*Nothing in the original PDF except scattered "paid?" annotations on save destinations
(p.3 "To GitHub (paid?)", "To private server (paid)"). The Pro tier is mostly invented
here from the existing `Mock Share Dialog B` in <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a> ("Pro Subscription ($25/mo)") and
the quota-tracking notes in `identity-decoupling-decisions.md`.*

*v0.4 framing (from the ai-strategy synthesis): the paid boundary must align with
the moat, not against it. **Quota by model size/complexity, never by model
count** — a per-model quota taxes exactly the commodity users we'd rather keep as
free funnel, while a size/complexity threshold charges the user for whom Share is
the only thing that works. And Phase D ships as an **experiment with stated
hypotheses** (what share of users hit the threshold; of those, who pays vs.
churns) instrumented well enough to produce decision-grade conversion evidence —
not just a revenue trickle.*

**Epic `subscribe-100`: Pricing tiers + feature manager** ⬜ (NEW)
- Tasks: enumerate features per tier; ship a `tier`-aware capability map; UI in <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>
  mock dialog form.
- Tier axis (v0.4): small models stay free and unlimited; the Pro boundary is
  **model size/complexity** (plus private sharing, multi-account, ad-free).
  Threshold placement is a §10 open question — it wants the model-size
  distribution from telemetry before it's picked.
- **Required for Pro-MVP.**

**Epic `subscribe-110`: Stripe checkout + portal** ⬜ (NEW)
- Tasks: `create-portal-session` Netlify Function exists already (per identity
  decoupling decisions doc — model pattern for new functions). Add
  `create-checkout-session`; webhook for status changes; persist Pro flag against
  Auth0 `sub`.
- **Required for Pro-MVP.**

**Epic `subscribe-120`: Quota tracking** ⬜ (NEW)
- Tasks: server-side counter keyed by Auth0 `sub` (per identity-decoupling-decisions
  §Q4 Open Question on "Quota tracking"); enforcement points in (a) GLB writer
  Phase-5 share upload, (b) per-connection refresh-token mint, (c) public-share
  retention sweep — **plus (d) the size/complexity gate at model load/parse**,
  which is the moat-aligned boundary (v0.4). Note (d) is client-observable
  (parse happens in-browser), so enforcement is a product/UX gate + account
  state, not a hard server wall — fine for an experiment, revisit if abused.
- Experiment instrumentation is part of the epic, not an afterthought: events
  for threshold-hit, upgrade-prompt-shown, converted/churned, so the quota run
  yields decision-grade evidence either way.
- **Required for Pro-MVP.**

**Epic `subscribe-130`: Ads on free tier** 🟡
- Track dependency: T7 Ads (<a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a>). Phase 1 activation in flight (<a href="https://github.com/bldrs-ai/Share/issues/1523" target="_blank" rel="noopener noreferrer">#1523</a>).
- Open: Phases 2 (manual slots) + 3 (responsive) + 4 (consent gating).
- **Required for Pro-MVP** — the free tier monetisation path.
- Scope note: T7 is **on-site AdSense** (revenue). The Google Ads **acquisition**
  campaigns (Smart→Search rebuild, keywords, geo, bidding) are out of repo scope —
  owned in the private bizdev growth-strategy doc §4. The in-repo dependency runs
  the other way: those campaigns need `grow-100` landing pages as destinations and
  `grow-120` events to bid against.


### 4.10 Grow (NEW Epic group)

Users find Bldrs without us paying for every visit, and shared links convert
recipients into new users. Driven by the growth-strategy conclusions summarised in
the v0.3 note above: organic ≈ zero, the share loop is the best earned channel we
have, and the acquisition campaigns need real landing targets and funnel events.
Quantitative targets live in the **private** bizdev doc; only event names and
mechanisms are recorded here.

*v0.4 scope check: this group is **free-tier demand-gen + measurement**, and it
stays cheap. The broad "open X file online" audience is the commodity segment —
it feeds the funnel and the share loop but it is not where willingness-to-pay
lives, so Phase G doesn't grow beyond the epics below. The audience that pays
(large-model, enterprise-profile) gets its own positioning surface (`grow-130`);
which channel *reaches* that audience is the open GTM question owned bizdev-side
(ai-strategy §6).*

**Epic `grow-100`: SEO format landing pages** ⬜ (NEW)
- Programmatic per-format pages — `/viewer/ifc`, `/viewer/step`, `/viewer/stl`,
  `/viewer/obj`, … — each a real static page (title, copy, demo-model deep link,
  FAQ) targeting "open/view X file online" queries.
- Foundation already landed: the marketing site is Next.js SSG (PR #1519 —
  `marketing/`, crawlable HTML, sitemap/robots/RSS). These pages are new routes in
  that build, not SPA work. IFC + STEP first (STEP support is now real via T1 and
  is the second acquisition campaign's landing target), then STL/OBJ/FBX.
- Doubles as the destination for paid Search (bizdev §4) — until these exist the
  campaigns land on the homepage, which is a viewer, not a pitch.
- **Phase G.**

**Epic `grow-110`: Rich share-link previews (OG cards)** ⬜ (NEW)
- A shared `/share/*` link should unfurl in Slack/WhatsApp/LinkedIn/Teams with a
  model thumbnail + title — both loop fuel (recipient trust/CTR) and SEO.
- Supersedes the intent of <a href="https://github.com/bldrs-ai/Share/issues/1315" target="_blank" rel="noopener noreferrer">#1315</a>: the marketing routes got SSG in PR #1519, but
  `/share/*` stays SPA, so per-model OG tags need edge/function injection (or
  pre-render at share time — e.g. write the OG image alongside the T2 GLB share
  artifact). Design call in Phase G.
- Recipient landing experience rides along: a shared view should offer "Open your
  own model" / "What is this?" affordances so recipients convert to sharers.
- **Phase G** (metadata + affordances); OG image generation may slip to Phase C
  where it pairs with the T2 Phase 5 share artifact.

**Epic `grow-120`: Funnel instrumentation + analytics hygiene** ⬜ (NEW)
- Instrument the funnel stages the growth doc defines (§3 there):
  `share_link_created`, `share_link_opened`, `model_interacted` events in Share;
  the derived `real_model_open` key event (built on `select_content` +
  `stats_preprocessorVersion`) is GA4 config, not code.
- Hygiene: skip GA init when `navigator.webdriver === true` or when
  `location.hostname !== 'bldrs.ai'` — one guard cleans CI/e2e, localhost, and
  preview-deploy pollution out of prod analytics. (Also: confirm whether scheduled
  e2e runs ship the prod measurement ID.)
- Channel-grouping + dashboard slices are bizdev-side config; the Share-side
  deliverable is the events existing and firing.
- v0.4 addition: capture **model size/complexity** (bucketed — bytes, element
  count) on the model-open event, so (a) the `subscribe-100` quota threshold is
  picked from real distribution data, not guessed, and (b) large-model users —
  the segment that matters — become visible in the funnel instead of drowned in
  commodity traffic.
- **Phase G — first slice.** Blocks conversion-based bidding, loop metrics, and
  any honest read of a launch/Show-HN spike.

**Epic `grow-130`: Large-model + data-sovereignty positioning** ⬜ (NEW, v0.4)
- The positioning surface for the audience that pays: a page (marketing SSG
  build) that leads with **"AI iterates on models nobody else can even open"**
  and the two proof points behind it — large-model handling that defeats
  proprietary and open-source alternatives, and **no-upload data sovereignty**
  ("runs in-browser; your model never leaves your machine" — written to be
  quoted in a security review, e.g. what does/doesn't leave the browser, where
  tokens live, what the share flow uploads and only when asked).
- A large-model live demo deep link is the centerpiece — show, don't claim.
  Benchmark specifics stay qualitative here and quantitative in the private
  strategy doc; the public page can carry whatever benchmark we're happy to
  defend publicly.
- Distinct from `grow-100`: format pages target commodity search intent
  (demand-gen); this page is where enterprise-profile visitors land from
  outbound/community/DevRel motion and from "what makes Bldrs different" links.
- **Phase G** (it's one page on the existing SSG build), refreshed at §7 AI.2
  when the AI-on-large-model demo exists.


### 4.11 Assist (NEW Epic group — the AI workspace)

User works *with an AI agent* on their models and projects: converses with it,
collaborates with teammates in the same conversation, and accumulates AI-built
tools. This group is the Epic-level decomposition of the §7 pivot; read §7 for the
vision, architecture, and sequencing. Design doc to draft: `design/new/ai-workspace.md`.

**Epic `assist-100`: Workspace shell — left drawer, projects + org nav** ⬜ (NEW)
- A modification of the existing UI adding a **left drawer** for workspace-level
  navigation: projects (models, conversations, shared artifacts, recents) and
  company-level nav (org, members, settings). Makes Share feel like a workspace
  rather than a single-document viewer — the Claude-Code chrome around the canvas.
- Pure UI + routing + state work; no AI-runtime dependency. Ships behind
  `?feature=workspace`.
- Interacts with: `open-130` Sources tab (accounts live in the same nav), T4
  sharing (shared-with-me listing), `identity-130` profile drawer.

**Epic `assist-110`: Conversational agent panel (single-user)** ⬜ (NEW)
- A Claude-Code-like conversation panel over the open project/model: prompt →
  agent loop → tool calls against the viewer → streamed response. The viewer
  exposes its operations (load, camera, select, isolate/hide, properties/psets,
  notes, search) as an **MCP tool surface** (Track T11); the agent is its first
  consumer.
- Single user, one conversation per project/model. This is the demo that sells
  the pivot (§7.4 AI.2).
- Absorbs `search-120`'s NL-QA ambition; T10 owns the runtime + conversation
  persistence.

**Epic `assist-120`: Multi-user channels + AI participation modes** ⬜ (NEW)
- The conversation becomes a shared channel. The key mechanic:
  - **Direct replies addressed to the AI** are commands — handled exactly as the
    single-user panel handles a prompt (full agent loop + tool calls).
  - **General channel discussion** is human↔human; the AI is aware of it as
    context and may participate **comment-only** — it can contribute
    observations, but a channel message never triggers the tool-using loop.
    Only direct address does.
- Depends on a shared conversation store with realtime sync (T10) and T4
  sharing/grants for channel membership. Largest new backend piece — last in the
  pivot sequence (§7.4 AI.4).

**Epic `assist-130`: AI-apps toolbelt (right drawer)** ⬜ (NEW)
- The existing right-drawer AppsDrawer, upgraded: code the agent generates can be
  **saved, versioned, and run** in a sandboxed iframe that talks to the main app
  context over an **MCP bridge** (postMessage transport) — the same tool surface
  the agent uses (T11). Users accumulate personal/team toolbelts of generated
  apps.
- This is the user-generated-app story `apps-100`/`apps-130` always pointed at,
  with the agent as the author. `apps-120`-style model checks become toolbelt
  apps.
- Pre-condition: fix <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> (iframe widget integration broken, suite disabled).
- Storage/versioning candidate: the user's own hosting via T3/T4 providers (apps
  are files too), keeping the BYOS shape of the rest of the product.


## 5. Cross-cutting Tracks

Each track has its own long-form design doc. This section is the one-paragraph
overview + status + Epic linkage; details live in the linked docs. Each entry uses the
same list-item order: What, Status, Unblocks, Pro-MVP impact, Doc.


### Track T1: Viewer Replacement

- **What:** Replace `web-ifc-viewer` + `web-ifc-three`. Cuts the three.js 0.135 anchor;
  ships Conway-direct IFC parse, per-instance picking, unified Clipper. Conway-direct
  also parses **STEP / AP214** assemblies, with per-occurrence NavTree↔scene selection
  and hide keyed on the occurrence path (`design/new/step-occurrence-selection.md`).
- **Status:** Phases 0–4 + 5a + 5b landed. `conwayDirectIfc` + `glb` default-on.
  **Adapter removal landed (2026-06)** — the `conway-web-ifc-adapter` shim is
  retired; Share consumes `@bldrs-ai/conway/web-ifc` directly and the release
  chain is Conway → Share (`design/new/adapter-removal.md`). **GPU instancing
  active (§3b.iv):** grouper analysis (#1568), `BatchedMesh` render path behind
  `?feature=batchedMesh` (#1571), batched→merged GLB-cache bake (#1574).
  **STEP metadata** extraction landed conway-side (conway #345 arc); Share
  verification + occurrence-path permalink key are open (#1569, #1570).
  Remaining: perf items (on-demand rendering, hover-pick throttle), per-product
  mesh emission spike, `batchedMesh` always-on flip, `EXT_mesh_gpu_instancing`
  cache schema (§3b.v), **public-launch test gate** (4-angle screenshots + GLB
  bit-level diff harness).
- **Render look (§6e):** the filmic/PBR look — uniform `MeshStandardMaterial` +
  sRGB albedo, gradient studio IBL, Khronos-Neutral tone-mapping, retuned lights,
  a user-facing **Neutral / Flat** render-mode toggle in the profile menu, plus a
  `?feature=look` tuning GUI and dev-only AO + contact-shadow. Shipped **behind
  `?feature=look` (default off)** — the default still renders the legacy look. To
  go live: flip the flag default + regenerate the screenshot baselines (one PR).
  See `design/new/viewer-replacement.md` §6e.
- **Unblocks:** `view-100`, `view-110`, `view-130`, `view-150`, `view-160`, T2.
- **Pro-MVP impact:** Required — public-launch gate.
- **Doc:** `design/new/viewer-replacement.md`.


### Track T2: GLB Model Sharing

- **What:** Content-addressed GLB cache + originator-side share. Phases 0–3 (cache
  key, extension split, picker fix, BLDRS_* extensions) landed.
- **Status:** Phases 4 (Notes + view-states v0.1 round-trip), 5 (originator share
  flow), 6 (shared cache tier — Drive/Firebase) open.
- **Unblocks:** `share-110`, `notes-120`, `view-150` perf wins.
- **Pro-MVP impact:** Phase 5 (originator share flow) — required. Phase 4 — required
  (so notes survive cache hits). Phase 6 — post-MVP optimisation.
- **Doc:** `design/new/glb-model-sharing.md`.


### Track T3: Identity Decoupling

- **What:** GitHub as `ConnectionProvider` peer of Drive. Two Netlify Functions for
  the OAuth code/refresh exchange; multi-account GitHub support; legacy
  Auth0-federated path retained for migration.
- **Status:** PR1 (provider scaffolding + Functions) merged. PR2 (SourcesTab UI
  integration, recents migration) + PR3 (switchover + flag retire) open.
- **Unblocks:** `identity-110`, `identity-120`, `identity-130`, `open-130`,
  `share-130`, `subscribe-120` (quota keying), and T4 PR3 (GH sharing).
- **Pro-MVP impact:** PR2 + PR3 required.
- **Docs:** `design/new/identity-decoupling.md` + `identity-decoupling-decisions.md`.


### Track T4: Multi-User Sharing

- **What:** Grants/revoke, visibility, folder-scoped routes; consistent across Drive
  + GitHub. Stretch: portable sidecar formats for Notes + Versions, round-trippers to
  git.
- **Status:** PR1 (provider scaffolding) merged. PR2 (Drive Share dialog UI), PR3 (GH
  sharing adapter), PR4 (folder boundary routes) open. PR5 (GH token-health parity)
  and PR6 (flag retire) follow.
- **Unblocks:** `share-120`, `share-130`, `share-140`, `notes-120`, `versions-120`.
- **Pro-MVP impact:** PR2 + PR3 required (private sharing is a paid feature). PR4
  post-MVP. PR5 nice-to-have.
- **Docs:** `design/new/multi-user-sharing.md` + `design/new/sharing-pr3-github.md`.


### Track T5: Drive Recents HEAD-check

- **What:** Pre-flight Drive metadata check on recents click; typed `FileUnreachable`
  alert variants.
- **Status:** Proposed. Not started.
- **Unblocks:** `open-150`. Pattern reusable for GH recents once `githubAsSource`
  lands.
- **Pro-MVP impact:** Polish; not strictly required for paid launch but the support
  cost of "Failed to parse model" on dead recents is real.
- **Doc:** `design/new/drive-recents-head-check.md`.


### Track T6: Notes & Versions sidecar formats

- **What:** Provider-neutral JSON sidecar formats for notes + versions, round-tripping
  between Drive snapshots and git issues/commits.
- **Status:** Not started.
- **Unblocks:** `notes-120`, `notes-110` (BCF can be derived), `versions-120`.
- **Pro-MVP impact:** Post-MVP. Quarter-scale work.
- **Doc:** `multi-user-sharing.md` §Stretch (Q1–Q4).


### Track T7: Ads

- **What:** AdSense free-tier monetisation without Auto-ads on viewer routes.
- **Status:** Phase 1 activation in flight (<a href="https://github.com/bldrs-ai/Share/issues/1523" target="_blank" rel="noopener noreferrer">#1523</a>). Phases 2–4 outlined.
- **Unblocks:** `subscribe-130`.
- **Pro-MVP impact:** Phase 1 required (activate publisher account). Phases 2–3
  should land before public launch but can lag a beat.
- **Doc:** `design/new/ads.md` + epic <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a>.


### Track T8: Pro/Billing (NEW track)

- **What:** Tier definitions, Stripe integration, quota infrastructure, feature-gate
  plumbing throughout the app.
- **Status:** Not started. Existing seeds: `netlify/functions/create-portal-session.js`,
  `netlify/functions/unlink-identity.js` (pattern reuse).
- **Unblocks:** `subscribe-100`, `subscribe-110`, `subscribe-120`. Forward-looking:
  the same quota/metering rails are what §7 AI usage metering hangs off — design
  the counter keying with that consumer in mind.
- **Quota axis (v0.4):** model size/complexity, never model count — the paywall
  aligns with the moat (small models free + unlimited; the threshold sits where
  Share is the only thing that works). Phase D runs as an instrumented
  experiment; see §4.9.
- **Pro-MVP impact:** Required end-to-end.
- **Doc:** TBD — to be drafted in `design/new/pro-billing.md`.


### Track T9: Growth funnel & SEO surfaces (NEW)

- **What:** The Share-side infrastructure the growth strategy needs: funnel events
  (`share_link_created` / `share_link_opened` / `model_interacted`, plus v0.4
  size/complexity buckets on model-open), analytics hygiene (webdriver + hostname
  guard on GA init), OG/link-preview metadata on share URLs, the
  `/viewer/<format>` landing pages, and the `grow-130` large-model +
  data-sovereignty positioning page — all on the marketing SSG build.
- **Status:** Not started in-repo. The enabling substrate (Next.js SSG marketing
  build, PR #1519) is landed; strategy + attribution live in the private bizdev
  docs.
- **Unblocks:** `grow-100`, `grow-110`, `grow-120`, `grow-130`; honest measurement
  of every outreach move in `community-130`; conversion-based bidding for the
  (out-of-repo) acquisition campaigns; the Phase D quota-threshold pick.
- **Pro-MVP impact:** Phase G — parallel, starts now. Cheap relative to everything
  else in §6 and the only work that grows the top of the funnel.
- **Docs:** `bldrs-ai/bizdev` `docs/growth-strategy.md` + `docs/ai-strategy.md`
  (**private** — numbers stay there) + `design/new/ads.md` (on-site ads only).


### Track T10: Agent runtime & conversation store (NEW)

- **What:** The conversational core of the §7 pivot: agent loop (LLM calls, tool
  dispatch, streaming), conversation persistence, and — for `assist-120` — a
  shared store with realtime sync and the direct-address vs channel-awareness
  routing.
- **Status:** Not started. Design questions (runtime placement client vs broker,
  provider strategy, store choice, relation to Notes) go to
  `design/new/ai-workspace.md` first — see §7.4 AI.0 and §10 open questions.
- **Unblocks:** `assist-110`, `assist-120`, `search-120` (as retrieval), and the
  §7 AI-metering upsell.
- **Pro-MVP impact:** None (pivot arc). Must not destabilise Phases A–E.
- **Doc:** TBD — `design/new/ai-workspace.md`.


### Track T11: App sandbox + MCP bridge (NEW)

- **What:** The viewer's operations exposed as one **MCP tool surface** (selection,
  camera, isolate/hide, properties, notes, model queries), consumed by two
  clients: the T10 agent in-process, and sandboxed iframe apps over a postMessage
  MCP transport. Plus app storage/versioning for the toolbelt. Forward scope
  (v0.4): **write/edit tools** — the AI editing loop (§7.4 AI.5) rides this same
  contract but is gated on a Conway-side write path that doesn't exist yet.
- **Status:** Not started. Seeds: `WidgetApi/` + AppsDrawer (`apps-100`), the
  `IfcModelService` query surface (T1). Known debt: <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> iframe integration
  broken with its suite disabled — repair is the first slice.
- **Unblocks:** `assist-130`, `apps-130` (MCP-first public API), `apps-120`
  (checks as toolbelt apps).
- **Pro-MVP impact:** None (pivot arc), except the #1386 repair which is
  independently worthwhile.
- **Doc:** TBD — `design/new/ai-workspace.md` (sandbox/security section).


## 6. Pro-MVP plan

Goal: ship the **paid tier** publicly. Free + Pro coexist; anonymous use stays
possible; private sharing + multi-account + quota are paid; ads run on free.

This is a phased plan, not a sprint schedule. Each phase ends with a green CI + a
public canary. Phases A–B can overlap; C–E sequence. **Phase G is new in v0.3 and
runs in parallel starting now** — it's small, mostly independent of the viewer and
identity arcs, and it's the only work in this plan that grows the top of the
funnel. Rationale: the growth-strategy attribution work showed we currently earn
almost no traffic (organic ≈ zero) while the one earned channel that does work —
shared links — is uninvested; and the paid acquisition rebuild needs landing pages
and conversion events from this repo before it can optimise. Launching Pro (D/E)
into a funnel with no earned channels wastes the launch.


### Phase G (parallel, starts now): Growth funnel + SEO surfaces
**Goal:** the funnel is measurable, share links unfurl, and search intent has a
landing page — before the Pro launch needs any of it.
- `grow-120` first slice: GA hygiene guard (`navigator.webdriver` +
  hostname check on GA init) — cleans CI/e2e/preview pollution out of prod data.
- `grow-120` events: `share_link_created`, `share_link_opened`,
  `model_interacted` wired into the share flow + viewer; `real_model_open`
  derived key event configured GA4-side.
- `grow-100`: `/viewer/ifc` + `/viewer/step` landing pages on the marketing SSG
  build (then `/viewer/stl`, `/viewer/obj`, …). Unblocks the acquisition-campaign
  landing targets.
- `grow-110`: OG/Twitter metadata on share URLs so links unfurl with a model
  thumbnail; recipient "Open your own model" affordance. Per-model OG image
  generation may pair with T2 Phase 5 in Phase C if edge injection is the chosen
  route.
- `grow-120` v0.4 slice: size/complexity buckets on the model-open event — the
  data the Phase D quota threshold gets picked from.
- `grow-130`: the large-model + data-sovereignty positioning page.

**Exit:** funnel dashboard shows clean stage-by-stage counts (with large-model
users visible as a segment); a shared link unfurls with a thumbnail in Slack;
format pages + positioning page indexed.


### Phase A: Stabilise the rebuilt viewer (foundation)
**Goal:** the Pro launch can't ship if the viewer regresses on real models.
- T1 remaining slices:
  - `IfcViewsManager` deletion (§3c.iv slice 1).
  - On-demand rendering (dirty-flag) — biggest framerate win available.
  - Per-product Mesh emission spike — measure cost.
- Flag-flip decisions (each is one PR + baseline regen once smoke-tested):
  - `?feature=batchedMesh` always-on (§3b.iv — needs per-occurrence narrowing on
    the batched path first, or an accepted gap).
  - `?feature=look` default-on (§6e render look — flip + regenerate screenshot
    baselines).
- Correctness bugs on the rebuilt path: <a href="https://github.com/bldrs-ai/Share/issues/1561" target="_blank" rel="noopener noreferrer">#1561</a> camera-fit "last scene child"
  heuristic, <a href="https://github.com/bldrs-ai/Share/issues/1545" target="_blank" rel="noopener noreferrer">#1545</a> wrong arg to `getIfcType`, <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a> (critical) element-permalink
  hydration on private models.
- STEP follow-through: Conway release bump + <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a> NavTree/Properties verification
  over the NIST corpus; occurrence-path permalink key.
- T1 **public-launch gate**: 4-angle screenshot harness + GLB bit-level diff against
  golden artifacts. Runs in CI. This is the "we won't regress on the things that
  worked" insurance.
- Stretch in this phase: hover-pick throttle tuning; subset-pool unification;
  `EXT_mesh_gpu_instancing` cache schema (§3b.v).

**Exit:** screenshot harness green on the fixture corpus; on-demand rendering shipped
default-on; flag-flip decisions made (shipped or explicitly deferred).


### Phase B: Identity + Sources, multi-account
**Goal:** the Pro user has a coherent multi-account identity that quota tracking can
hang off.
- T3 PR2 (SourcesTab GitHub integration + recents migration). Behind `githubAsSource`
  flag.
- T3 PR2 follow-up: gate connect actions behind Auth0 primary auth (per decisions doc
  §PR2 "Gate connection actions behind Auth0").
- `identity-120`: <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a> Auth disambiguation chooser.
- `identity-130`: profile drawer multi-account picker + "Saving as X" footer.
- T3 PR3 switchover; retire `githubAsSource` flag.

**Exit:** a user logged-in via Google can browse and save to two GitHub accounts;
recents are correctly attributed per-connection; commit author = Sources GH identity.


### Phase C: Sharing v1
**Goal:** in-app share with grants + visibility, parity Drive ↔ GitHub.
- T4 PR2 (Drive Share dialog UI). Behind `sharing` flag.
- T4 PR3 (GitHub sharing adapter) — uses T3's GitHubProvider. Same flag.
- T4 PR5 (GH token-health parity) — small.
- T2 Phase 4 (Notes + view-states v0.1 in artifact).
- T2 Phase 5 (Originator share flow: drop IFC → GLB → upload artifact → link). Wires
  the Share dialog from `share-150` (<a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>) on top.
- `share-120` private link sharing surfaces in the dialog.
- `share-130` people-grants surface in the dialog.
- `grow-110` completion: per-model OG image written alongside the T2 Phase 5 share
  artifact (if that's the chosen mechanism), so every share link unfurls with a
  real thumbnail. The share loop is our best earned channel — this phase is where
  it gets its polish.
- Retire `sharing` flag once metrics + canary look clean.

**Exit:** a user can click Share on a model, invite a teammate by email/login, and the
teammate opens the link in <2s — and the link unfurls with a model thumbnail where
it was pasted.


### Phase D: Subscribe
**Goal:** the Pro tier exists and bills — run as an **instrumented experiment**
(v0.4): hypotheses stated up front (share of users hitting the size threshold;
of those, pay vs. churn), events in place to answer them, and the outcome
treated as evidence about where willingness-to-pay lives even if revenue is
small. The quota axis is **model size/complexity**, never model count — small
models stay free and unlimited.
- T8 design doc (`design/new/pro-billing.md`) drafted first — locks in tier
  definitions + the experiment's hypotheses/threshold before code. Threshold
  picked from the `grow-120` size-distribution telemetry (Phase G), not
  guessed.
- `subscribe-100` pricing tiers + feature-gate map.
- `subscribe-110` Stripe checkout + portal Netlify Functions. Pattern from
  `unlink-identity.js`.
- `subscribe-120` quota tracking — instrument the three enforcement points (GLB
  upload, refresh-token mint, public-share retention).
- T7 Phase 2 + 3 ad slots on `/about`, `/privacy`, `/tos`, `/blog/*`.
- `subscribe-130` ads wired to free-tier-only gate.
- `share-150` Extended Share dialog (<a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>) wires Pro upsell into the share flow.

**Exit:** a free user hits the size/complexity threshold and can upgrade in two
clicks; ads serve on text routes only; the experiment dashboard answers the
stated hypotheses.


### Phase E: Public-launch checklist
**Goal:** the public site is ready for cold traffic.
- T7 Phase 4 (consent gating) if EU consent landscape requires.
- T5 Drive recents HEAD-check (and GH + local/OPFS equivalents — <a href="https://github.com/bldrs-ai/Share/issues/1548" target="_blank" rel="noopener noreferrer">#1548</a>) — UX
  polish; reduces "WTF failures."
- `community-110` thumbs feedback widget.
- Sentry + GA dashboards confirmed; runbook for typical failure modes. Funnel
  events (Phase G) reviewed against a week of real traffic.
- Pricing page + ToS + Privacy updated.
- Decision: drop T5 of the legacy Auth0-federated GH path, or leave for one more
  release.
- Outreach readiness: the Show HN moment (bizdev doc §7) waits for this phase —
  spike traffic against an uninstrumented funnel is wasted; with Phase G landed
  it's the launch amplifier.

**Exit:** Pro launch announcement.


## 7. The AI-workspace pivot

**Status:** direction agreed (2026-07). Design doc to draft at
`design/new/ai-workspace.md` before implementation starts. This section is the
roadmap-level summary: the vision, the three architecture surfaces, what existing
work it absorbs, and how it sequences against the Pro-MVP.

### 7.1 Vision

Share pivots from "viewer with collaboration features" to an **AI-native workspace
for built-environment models** — the Claude-Code experience, where the working
context is a CAD/BIM project instead of a repo checkout. The user talks to an
agent that can see and operate the viewer (load, navigate, select, isolate,
annotate, query properties and structure), collaborates with teammates inside the
same conversation, and accumulates reusable AI-built tools.

**The strategic frame (v0.4, from the ai-strategy synthesis):** the engine is the
moat *because* it is the substrate an AI loop on real models requires — holding a
large, real-world model client-side, fast, with a full structured IFC/STEP API.
Tools that take minutes just to load such a model can't put it into an
interactive AI loop at all. So the headline is **"AI iterates on models nobody
else can even open"** — not "fastest browser engine" (that framing sells a
viewer). What compounds on top: the semantic IFC/STEP API as the agent-binding
layer (MCP, T11), no-upload data sovereignty, and the toolbelt flywheel. The
pivot's success metric is correspondingly concrete: **a handful of large-model,
enterprise-profile users doing AI-on-a-model they can do nowhere else — and
paying** — outweighs any amount of free small-model traffic.

Everything shipped to date is the substrate, not a detour: Conway-direct gives
structured model access (the `IfcModelService` query surface), Notes give anchored
discussion, the AppsDrawer + `WidgetApi` give an embedding surface, T3/T4 give
identity and sharing, T8 gives the metering rails. The pivot recomposes these
around a conversational core rather than building beside them.

### 7.2 Architecture: three surfaces

1. **Left drawer — workspace nav (`assist-100`).** A modification of the existing
   UI: a left drawer tracking **projects** (models, conversations, shared
   artifacts) and **company-level nav** (org, members, settings). The container
   that turns Share from a single-document viewer into a workspace. Pure
   UI/routing work; ships behind a flag with no AI-runtime dependency.
2. **Conversational panel (`assist-110`, `assist-120`).** A Claude-Code-like
   conversation over the open project/model. The multi-user mechanic:
   - **Direct replies addressed to the AI are commands** — treated exactly as
     Claude Code treats a prompt today: agent loop, tool calls against the
     viewer, streamed responses.
   - **General channel discussion is human↔human** — the AI is aware of it as
     context and can participate **comment-only**. A channel message never
     triggers the tool-using agent loop; only direct address does.
   The split keeps the agent useful in a group without it hijacking every thread.
3. **Right drawer — AI-apps toolbelt (`assist-130`).** The existing right-drawer
   AppsDrawer, upgraded: code the agent generates is **saved, versioned, and
   run** in a sandboxed iframe that interacts with the main window/app context
   over an **MCP bridge** (postMessage transport). Users accumulate personal and
   team toolbelts of generated apps.

The unifying piece: the main window exposes the viewer as an **MCP server**
(selection, camera, isolation, properties, notes, model queries — Track T11).
The conversational agent and the sandboxed apps consume the *same* tool surface —
one contract, two consumers — and `apps-130`'s public API becomes a third
consumer of it later, for free.

Two v0.4 constraints on that architecture:

- **Data sovereignty is load-bearing.** "Your model never leaves your machine"
  is an enterprise wedge (`grow-130`), and the agent must not silently break
  it. Model bytes stay client-side; what crosses the wire to the LLM provider
  is the conversation plus tool *results* (which can contain model-derived
  data — names, properties, geometry summaries). That boundary needs to be
  explicit, documented, and ideally user-visible ("what the AI can see").
  Design treatment in `ai-workspace.md`; it also weighs on the runtime-placement
  question (§10) — a broker that proxies model content wholesale would forfeit
  the story.
- **Read first, edit as the north star.** The tool surface above is
  read/annotate (query, navigate, notes). The headline capability is the AI
  **editing** loop — the agent modifying the model, not just inspecting it.
  That is gated on an engine write path (Conway-side: mutate + re-emit
  geometry/semantics), which doesn't exist yet and is the biggest open
  technical question in the pivot (§10). Sequence honestly: AI.2 ships the
  read/annotate loop on large models (already beyond what anyone else can do);
  editing lands as AI.5 when the engine supports it — don't let the headline
  claim outrun the write path.

### 7.3 What it absorbs

- `search-120` Knowledge graph → the retrieval layer behind conversational QA.
- `apps-130` v1.0 Public API → designed MCP-first; external IDE/embed consumers
  and the internal toolbelt share one contract.
- `apps-120` Bldrs Integrate → agent-run model checks as toolbelt apps.
- `notes-*` / channels → need one coherent story: an anchored note thread and a
  channel message are close cousins (open question, §10).

### 7.4 Sequencing

The pivot **follows the Pro-MVP**: Phases B–D give it identity, sharing, and the
billing/quota rails that AI usage metering hangs off — metered agent usage is the
natural Pro anchor, a cleaner upsell than private links alone. Foundations that
can't destabilise the launch may start earlier behind flags.

- **AI.0 — Design doc + seed repair (can start now).** Draft
  `design/new/ai-workspace.md`: agent runtime placement (client-direct vs server
  broker), provider strategy, conversation-store choice, sandbox/MCP security
  model, Notes/channels relationship. Fix <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> and re-enable the iframe
  suite — the sandbox foundation must hold weight before anything is built on it.
- **AI.1 — Workspace shell.** `assist-100` left drawer behind
  `?feature=workspace`. No AI dependency; can overlap Pro-MVP phases.
- **AI.2 — Agent v0, single-user.** `assist-110`: viewer MCP tool surface (T11) +
  agent loop (T10) + conversation panel. One user, one conversation per
  project/model. **This is the demo that sells the pivot — and it must be run
  on a large model** (one that defeats the alternatives), because
  "conversational AI over a small IFC" is replicable by anyone, while the same
  loop on a model nobody else can open is the moat made visible. Refresh
  `grow-130` with this demo when it exists.
- **AI.3 — Toolbelt.** `assist-130`: generate → save → version → run in the
  sandbox over the same MCP surface.
- **AI.4 — Multi-user.** `assist-120`: shared channels, direct-address vs
  comment-only mechanics, presence. Depends on the shared conversation store —
  the largest new backend piece.
- **AI.5 — Editing loop (north star).** Agent-driven model *modification*
  through the same MCP contract. Gated on the Conway write path (§7.2, §10);
  scope and staging live in `ai-workspace.md` + a Conway-side design doc once
  the write path is scoped.

Each stage is a shippable, demoable increment; AI.2 is the earliest point at
which the pivot is publicly visible.

### 7.5 What proves it

The benchmark proves the engine; it doesn't prove the business. The pivot's
validation target: **large-model, enterprise-profile users running the AI loop
on models they can't use anywhere else — paying**. Instrumentation to watch for
them: the `grow-120` size buckets (are large models showing up at all?), the
Phase D experiment (do size-threshold users convert?), and direct design-partner
outreach (bizdev-owned). A few of these users are worth more than any aggregate
traffic number, for both revenue and the company narrative.


## 8. Post-MVP backlog (loveable)

Held over for after Phase E. Items marked **→ §7** are absorbed by the AI pivot
and leave this queue — they ride the pivot sequencing instead. Order roughly
reflects current product-pull:

1. **`view-160` ETL / Table view** 🔮 (❤️ Markus). The "10$/mo by itself" loveable.
   Pre-cond mostly done via T1.
2. **`open-140` Multi-IFC overlay session** (<a href="https://github.com/bldrs-ai/Share/issues/1251" target="_blank" rel="noopener noreferrer">#1251</a>). Conway+GLB make this tractable.
3. **`view-130` Persistent visibility URL encoding** (<a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a>). Last slice on top of
   T1 isolate routing.
4. **`view-140` Selection-based camera + measurement** (<a href="https://github.com/bldrs-ai/Share/issues/1044" target="_blank" rel="noopener noreferrer">#1044</a>, <a href="https://github.com/bldrs-ai/Share/issues/1047" target="_blank" rel="noopener noreferrer">#1047</a>).
5. **T2 Phase 6 Shared cache tier** (Firebase/Drive sidecar).
6. **T4 PR4 Folder-scoped routes**.
7. **`notes-110` BCF round-trip**.
8. **T6 Stretch Q1–Q4 portable notes/versions** for Drive parity with GH.
9. **`view-170` Common view ops**: nav-cube, explode, undo/redo. IDS validation
   separately.
10. **`view-180` Maps-style filtering UI on top of Placemarks** 🔮 — Placemark
    primitive itself is 🟡 with polish slated for Phase C (see Epic). The filter
    chips + cluster rendering visualization on top is the post-MVP loveable.
    Pairs with T6 Q1.
11. **`search-110` Cross-repo search** 🔮 (❤️ Oleg). An agent with repo-source
    tools may deliver this as a §7 by-product — reassess once AI.2 exists.
12. **`apps-120` Bldrs Integrate (CI server-side IDS)** → §7 (toolbelt apps).
13. **`apps-130` v1.0 Public API + IDE** 🔮 → §7 (MCP-first, T11).
14. **`search-120` Knowledge Graph** 🔮 (❤️ Johannes) → §7 (retrieval behind
    `assist-110`).
15. **`versions-110` Diff between versions**.
16. **PDF "Smart Components & Templates"** 🔮 (❤️ Pablo). Massive scope; will warrant
    its own Epic group when started.
17. **PDF "Hangouts" (Miro, FPV, WebXR Bonanza)** — out of scope until use-case
    demand.
18. **PDF "Social Updates" (ActivityPub federation)** — interesting; no current pull.


## 9. Migration to GH issues + wiki

Once this doc lands, the backfill order:

1. **GitHub issues — Epics first.**
   For each Epic in §4 with status 🟡 or ⬜ and `Pro-MVP impact: required`, create an
   `epic`-labeled GH issue with the body content from the Epic block. Stable ID
   becomes the issue title prefix (e.g. `epic: open-130: SourcesTab with parallel GH +
   Drive accounts`). One pass; expect ~12–15 new Epic issues. The v0.3 groups ride
   the same pass: one `epic` issue per `grow-*` (Phase G starts now) and per
   `assist-*` (so pivot discussion has a home), even though the `assist-*` bodies
   will initially just point at §7 + the forthcoming `ai-workspace.md`.
2. **GitHub issues — Stories under Epics.**
   For each open story already in §3.1 (e.g. <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>, <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a>, <a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a>, <a href="https://github.com/bldrs-ai/Share/issues/1251" target="_blank" rel="noopener noreferrer">#1251</a>, <a href="https://github.com/bldrs-ai/Share/issues/1254" target="_blank" rel="noopener noreferrer">#1254</a>, <a href="https://github.com/bldrs-ai/Share/issues/850" target="_blank" rel="noopener noreferrer">#850</a>,
   <a href="https://github.com/bldrs-ai/Share/issues/890" target="_blank" rel="noopener noreferrer">#890</a>, <a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a>), use `mcp__github__sub_issue_write` to attach them under the right
   Epic. Re-title for consistency where useful.
3. **GitHub issues — backfill missing stories.**
   For Epics with `Pro-MVP impact: required` but no story coverage, create one story
   per acceptance criterion. Stories enter the queue with the corresponding `epic`
   sub-issue parent.
4. **Wiki rewrite.**
   Replace `Planning:-Requirements` with a public-facing summary derived from §4 of
   this doc. Strip the implementation links and `Pro-MVP impact` rows; keep the
   Epic-by-Epic structure with status. The wiki page becomes the user-facing roadmap.
5. **CLAUDE.md router row.**
   Added in this commit so future assistants find this doc.

I'll draft each batch and review with you before creating GH issues — won't bulk-create
without sign-off.


## 10. Open questions

- **Pro tier feature gate definition.** §4.9 sketches `subscribe-100`; the v0.4
  anchor is decided — the Pro boundary is **model size/complexity** — with
  private link sharing, ad-free, multi-account, cache retention, and quota
  uplift around it. Confirm the full list before the T8 design doc.
- **Quota threshold placement.** *Where* the size/complexity threshold sits is
  open — it should fall where free alternatives stop working and Share doesn't.
  Pick from the `grow-120` size-distribution telemetry (Phase G) + the
  engine-benchmark data, not by feel. (ai-strategy §9.3.)
- **Free-tier quota numbers.** Public anonymous share TTL (3 days? 5 days?), public
  hosting size ceiling (PDF <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a> says <10MB), refresh-token-mint rate. Needs a call
  before `subscribe-120`.
- **Auth0 enforcement on Netlify Functions.** Flagged in
  `identity-decoupling-decisions.md` §Open Implementation Details. Needs to be
  resolved before Phase D quota tracking ships (the quota key is meaningless if the
  functions are anonymous).
- **BCF priority.** Industry-credibility win vs. cost. If we want it for Pro-MVP it
  becomes Phase C scope; otherwise it slips to post-MVP per §8 item 7.
- **AI pivot — agent runtime placement.** Client-direct LLM calls (user's key /
  our key in the browser) vs a server-side broker (Netlify Functions or a real
  backend). The broker is where quota enforcement (T8) and key custody naturally
  live, but it's new server surface for a to-date-static product — and (v0.4)
  the **data-sovereignty constraint** cuts against anything that proxies model
  content wholesale: model bytes stay client-side, only conversation + tool
  results cross the wire, and that boundary should be user-visible. Decide in
  `design/new/ai-workspace.md` before AI.2.
- **AI pivot — engine write path.** The editing loop (§7.4 AI.5) needs Conway to
  support model mutation + re-emission (geometry and semantics), which today it
  doesn't. Biggest open technical question in the pivot: scope (parametric edits?
  property edits only at first? geometry?), where the edit log lives, and how
  round-tripping back to IFC/STEP works. Needs a Conway-side design doc; the
  answer decides how soon the headline capability is honest.
- **AI pivot — conversation store.** `assist-120` needs shared, realtime-ish
  conversation state. Candidates: GitHub-issue-backed (Notes-style, free, slow),
  Firebase/Firestore (already floated for T2 Phase 6), or a purpose-built
  backend. Also: are channels and Notes one primitive or two? (An anchored note
  thread and a channel message are close cousins.)
- **AI pivot — sandbox security model.** Toolbelt apps run generated code:
  iframe origin isolation, MCP tool permissioning (which tools does an app get,
  who approves), and versioned-app provenance all need a design pass (T11).
- **AI pivot — naming.** "Assist" is the working Epic-group verb; the
  user-facing name for the workspace/agent is unpicked.
- **Growth — OG image mechanism.** Edge-function injection on `/share/*` vs
  pre-rendering the OG image at share time next to the T2 artifact. Decides
  whether `grow-110` finishes in Phase G or pairs with Phase C.
- **Maintenance of this doc.** Cadence: bump on every Epic state change? Or quarterly
  rollup? My recommendation: amend per-PR when an Epic moves status; quarterly review
  to catch drift.


## 11. Doc maintenance

- **When an Epic ships:** update its row in §3.1 and its block in §4 from 🟡 → ✔.
  Move it out of the Pro-MVP phase list in §6 if it was there.
- **When a story closes:** add it to the Closed list under its Epic; PR description
  should reference `roadmap.md` if the change moves an Epic state.
- **When a track lands a slice:** update the Status line of the track in §3.2 and §5.
  If the track is "done" it becomes a one-line entry pointing at its design doc.
- **When a new Epic emerges:** add it to §4 under the appropriate verb group with a
  stable ID one above the highest existing in that group (e.g. `open-160`), and add
  the matching row to §3.1. Don't renumber existing IDs.
- **Don't delete done Epics.** They stay in §4 as the historical record of what
  shipped, which is what §8 "Post-MVP backlog" is measured against.
- **Privacy firewall.** This doc is public. Growth/traffic *numbers* (spend, CAC,
  geo, raw counts) never land here — they stay in the private bizdev
  growth-strategy doc. Event names, funnel stage definitions, and qualitative
  conclusions are fine.
