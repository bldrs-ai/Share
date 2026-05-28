# Bldrs Share Roadmap

**Status:** Draft v0.1 — initial reconciliation
**Date:** 2026-05-28
**Owner:** Pablo
**Source baseline:** `Share Requirements` Google Doc (Aug 2021, last updated Nov 2022). PDF
extract preserved in this commit's history; key Epic list inlined in §3.

This doc normalizes the legacy Epic list against ~2 years of execution since the last
top-down review, surfaces the work that landed without story tracking, and lays out the
**Pro/billing-ready MVP** plan plus the loveable backlog beyond it.

It is the single source of truth for Epic/Story/Task structure. The wiki page
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
them split: §3 is the Epic catalogue, §4 is the Track catalogue, §5 is the Pro-MVP
sequencing across both, §6 is what's loveable but post-MVP.


## 2. Status legend

| Symbol | Meaning |
|---|---|
| ✔ | Done in production. Default-on. E2E covered (or follow-up E2E captured). |
| 🟡 | In flight — PR open, design doc landed, or substantial code written behind a flag. |
| ⬜ | Backlog — defined enough to start, not started. |
| 🔮 | Loveable / post-MVP — held over from PDF's 🥇/❤️ markers or new. |
| 🔒 | Pro gated — free users can see it exists but can't use the full capability. |

Per the PDF: 🥉 = MVP, 🥇 = MLP (Minimum Loveable Product), ❤️ = personal MLP. I preserve
those markers in §3 next to the original ranking so we don't lose the people-attached
intent. New work added since the PDF is marked `(NEW)`.


## 3. Normalized Epic catalogue

Each Epic block: heading with stable ID; one-sentence purpose; status; legacy reference
in italics; closed stories (with GH numbers); open stories; gaps relevant to the
Pro-MVP; relevant tracks from §4.


### 3.1 Open

User can open a model from local, cloud, or shared link, with format breadth and
multi-model composition.

**Epic `open-100`: Open from local file system** ✔
*PDF Open.1 — done in PDF.* Still done. Drag-and-drop and file picker both wire to the
loader. Recent stability work via OPFS caching (`src/OPFS/`) and Conway-direct parse
(Track T1).
- Closed: #757 Open sample model, #934 DnD-to-update.
- No open stories; capability is steady-state.

**Epic `open-110`: Open from GitHub URL / UI** ✔
*PDF Open.2 (the open-the-model half).* Done.
- Closed: #765 GH URL, #1159 GH via UI, #1190 Tabbed Open dialog.
- Open: #761/#768 file-browser polish — superseded by `open-130`.

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
- Open: #1251 Open 200: import and overlay multiple models.
- Pre-condition: Conway-direct + GLB cache are stable per-model (✔ via T1/T2), so
  scaling to N models is now a UI + state-management problem, not an engine problem.
- **Not in Pro-MVP.** Loveable post-MVP.

**Epic `open-150`: Recents reliability** 🟡 (NEW)
*Not in PDF — surfaced by support friction.*
- Track dependency: T5 Drive recents HEAD-check (proposed).
- Story to file: `open-150: Recents show typed unreachable alert + remove-recent`.


### 3.2 View

User can inspect the model in 3D with the navigation, properties, search-by-element,
slice, and isolation controls expected of a BIM viewer.

**Epic `view-100`: 3D + NavTree + Properties** ✔
*PDF View.1 — done in PDF. Re-validated against Conway-direct + GLB cache.*
- Closed: #1031 Initial model load, #1046 Synchronized View+NavTree, #1042 Centering &
  reset, #1242 Access properties of selected element, #1048 Navigate by hierarchy.
- Open follow-up: NavTree on cache-hit GLB E2E spec (called out in
  `design/new/viewer-replacement.md` §3b.iii).

**Epic `view-110`: Cut planes** ✔
*PDF View.3 — Cut sub-item ✔.*
- Closed: #1106 View 100 Cutplanes.
- Open: #1045 View 200 surface-aligned cut-plane UI. **Post-MVP polish.**
- Track dependency: T1 (unified Clipper landed).

**Epic `view-120`: Shareable camera position** ✔
- Closed: #1043 View 100 Shareable camera position.
- Open: dropdown-share-button details from #1043 (QR code, toggle camera) — see also
  `share-100` below.

**Epic `view-130`: Persistent visibility / Isolate** 🟡
*PDF "View element subsets" — partial.*
- Open: #1250 View 200 Implement persistent visibility (URL-encoded
  `hiddenExpressIDs[]`).
- Track dependency: T1 §3b.iii isolate routing through IfcInstanceMap (landed).
  Persistence to URL is the remaining slice.

**Epic `view-140`: Selection-based camera + measurement** ⬜
- Open: #1044 View 200 Selection-based camera control; #1047 View 200 Distance
  measurement between elements.
- **Post-MVP.** Useful for the loveable target but not blocking.

**Epic `view-150`: Performance and large-model viewing** 🟡
*PDF View "design" section — loaded model is stored/cached for fast re-open;
multi-worker; etc.*
- Closed (effectively, via Tracks T1 + T2): OPFS cache, GLB cache, Conway-direct,
  per-instance picking, perf monitor (`?feature=perf`), DRACO compression unblocked.
- Open: on-demand rendering (dirty-flag, currently 60Hz unconditional — `viewer-
  replacement.md` §3c.iv "Open perf items"); hover-pick throttling tuning; per-product
  Mesh emission spike.
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

**Epic `view-180`: Maps-style view of issues w/filtering** 🔮
*PDF View.4 (🥇 MLP).*
- Never started. Per-issue lat/long-like coordinates on the model + filter chips +
  cluster rendering.
- **Post-MVP loveable.** Slots naturally next to T6 (Comments/Versions sidecar formats)
  once notes carry richer anchor + tag data.


### 3.3 Share (split out of legacy Collab)

User shares a model, a view, a note, or a region with another user — privately or
publicly — and the recipient sees what was intended.

**Epic `share-100`: Share link to current view (anonymous, public)** ✔
*PDF Collab.1 — done in PDF.*
- Closed: #1043 Shareable camera position.
- Open: QR code wiring exists per #1043 sub-tasks — verify in E2E.

**Epic `share-110`: Save model to user's hosting (originator-side persistence)** 🟡
*PDF Open.2 (the save half) + new "originator share" thread from T2.*
- Closed: #887 Versions 100 Save imported model (GitHub-only flow), #980 Versions 100
  Save model, #905/#904/#907 Save UI components + notification.
- Open: Drive-Save mirroring GitHub-Save (`GoogleDriveSave.ts` — flagged in
  `identity-decoupling-decisions.md` §"Adjacent work").
- Track dependency: T2 Phase 5 (originator share flow: drop IFC → GLB written
  locally → upload artifact to Drive/GitHub/Firebase → link).

**Epic `share-120`: Private link sharing + visibility chip** 🟡 (NEW)
*Not in PDF except as "Private hosting" sub-bullet under Open.1.*
- Track dependency: T4 Multi-User Sharing PR1 (landed: provider scaffolding + Drive
  adapter); PR2 (Drive Share dialog UI); PR3 (GitHub sharing adapter).
- Open: feature flag `sharing` is off; turn-on once PR2 lands.
- **Required for Pro-MVP** (private sharing is a paid feature per #1421).

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
- Open: #1421 Share (200) Extended login flow — the dialog that picks between
  anonymous-public-5-day, free-public-long-term, Pro-private, etc. This is the
  surface where the Pro pricing tiers become visible.
- **Required for Pro-MVP** (it's where the upgrade prompt lives).


### 3.4 Notes & Versions (split out of legacy Collab)

User leaves comments anchored to model elements, replies in a thread, and can revisit
a specific version of the model.

**Epic `notes-100`: Anchored notes (Github-backed)** ✔
*PDF Collab.2 — done in PDF (issued as #892 etc.).*
- Closed: #1054 Access list, #1055 Select note, #1057 Edit, #1058 Delete, #1059
  Create, #1056 GH-issue link, #978 Comments on a note, #1071 Share a note, #1072
  Access shared note.
- Open: #892 Notes 200 Anchor a note to an element — UI flow not landed yet (placemark
  on click); the data path works.

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
- Closed: #980 Save model, #1154 Show specific version.
- Open: #850 Versions 100 sha path (filtering to single-file commits unresolved); #890
  Versions 200 Delete a version (UI + flow not landed).
- **Pro-MVP**: enough is done for free-tier; Delete + branch UX polish slot post-MVP.

**Epic `versions-110`: Diff between versions** ⬜
*PDF Collab table — "Showing Diffs?"*
- Never started; needs a structural-diff between two IFC versions.
- **Post-MVP.** Significant scope.

**Epic `versions-120`: Portable versions for Drive (Versions manifest)** 🔮 (NEW)
- Track dependency: T4 Stretch Q3.
- **Post-MVP.**


### 3.5 Search

User finds elements in the current model, across their repos, or across the building
data graph.

**Epic `search-100`: Search current model** 🟡
*PDF Search.1 (MVP).*
- Closed: #1180 Search 100 Permalinks.
- Open: #1254 Search 100 Search model based on element name (highlighting in scene).
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
- **Post-MVP loveable.** Johannes is the design partner.


### 3.6 Identity & Account (NEW Epic group — implicit in PDF "Federated authentication")

User signs in, links data sources, and the system honors that even across primary-auth
changes (Google → GitHub or vice versa).

**Epic `identity-100`: Auth0 primary login** ✔
- Closed: #1052 Profile 100 Login (initial); #1070 Profile 100 Theme.
- Track dependency: none — Auth0 SPA SDK in place.

**Epic `identity-110`: GitHub as a Sources peer (not just primary)** 🟡
*New since PDF; full design in `identity-decoupling.md` + decisions doc.*
- Track dependency: T3 PR1 merged (provider scaffolding + Netlify Functions). PR2
  (SourcesTab integration) + PR3 (switchover + flag retire) open.
- Open: feature flag `githubAsSource` off.
- **Required for Pro-MVP.**

**Epic `identity-120`: Auth disambiguation across linked identities** 🟡
- Open: #1422 Auth Disambiguation — primary + linked stored in cookie; chooser surface
  for prior identities on next login.
- **Required for Pro-MVP** (otherwise users with two GH accounts can't tell what
  they're billed under).

**Epic `identity-130`: Profile drawer + multi-account picker** ⬜
- Implicit in T3 PR2 design.
- **Required for Pro-MVP** — the "Saving as X — GitHub" footer in the Save dialog
  (`identity-decoupling-decisions.md` §Q4).


### 3.7 Apps

Third-party (and dogfooded) apps add capabilities to Share via a stable API.

**Epic `apps-100`: Browse + select app (AppsDrawer)** ✔
- Closed: #1282 Apps 100.
- Open: nothing immediate. Surface exists; consumers are sparse.

**Epic `apps-110`: XYZ demo app (dogfood v0.1 API)** ✔
*PDF Apps.1 — done in PDF.*

**Epic `apps-120`: Bldrs Integrate (CI + ArchiCAD/Speckle)** 🔮
*PDF Apps.2.*
- Never started. Server-side IFC validation pipeline running IDS rules per commit
  (preview of view-170 IDS).
- **Post-MVP.**

**Epic `apps-130`: v1.0 Public API + docs + IDE integration** 🔮
*PDF Apps.3 (🥇 MLP).*
- Never started as a programmatic surface; the `WidgetApi/` directory is the seed.
- **Post-MVP loveable.**


### 3.8 Community & Onboarding

User finds out about Bldrs, gets oriented, leaves feedback, and finds product help.

**Epic `community-100`: Welcome dialog + onboarding** ✔
- Closed: #1285 About welcome dialog.

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
- Out of repo scope. Tracked here for completeness.


### 3.9 Subscribe (NEW Epic group)

User upgrades from free to Pro, the system tracks quota, and Pro-only features become
available.

*Nothing in the original PDF except scattered "paid?" annotations on save destinations
(p.3 "To GitHub (paid?)", "To private server (paid)"). The Pro tier is mostly invented
here from the existing `Mock Share Dialog B` in #1421 ("Pro Subscription ($25/mo)") and
the quota-tracking notes in `identity-decoupling-decisions.md`.*

**Epic `subscribe-100`: Pricing tiers + feature manager** ⬜ (NEW)
- Tasks: enumerate features per tier; ship a `tier`-aware capability map; UI in #1421
  mock dialog form.
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
  retention sweep.
- **Required for Pro-MVP.**

**Epic `subscribe-130`: Ads on free tier** 🟡
- Track dependency: T7 Ads (#1524). Phase 1 activation in flight (#1523).
- Open: Phases 2 (manual slots) + 3 (responsive) + 4 (consent gating).
- **Required for Pro-MVP** — the free tier monetisation path.


## 4. Cross-cutting Tracks

Each track has its own long-form design doc. This section is the one-paragraph
overview + status + Epic linkage; details live in the linked docs.

### Track T1: Viewer Replacement
**Doc:** `design/new/viewer-replacement.md`.
**What:** Replace `web-ifc-viewer` + `web-ifc-three`. Cuts the three.js 0.135 anchor;
ships Conway-direct IFC parse, per-instance picking, unified Clipper.
**Status:** Phases 0–4 + 5a + 5b landed. `conwayDirectIfc` + `glb` default-on. Remaining:
Phase 5 cleanup (drop wit-three entirely), perf items (on-demand rendering, hover-pick
throttle), per-product mesh emission spike, **public-launch test gate** (4-angle
screenshots + GLB bit-level diff harness).
**Unblocks:** `view-100`, `view-150`, `view-130`, all GLB-backed work in T2.
**Pro-MVP impact:** Required — public-launch gate.

### Track T2: GLB Model Sharing
**Doc:** `design/new/glb-model-sharing.md`.
**What:** Content-addressed GLB cache + originator-side share. Phases 0–3 (cache key,
extension split, picker fix, BLDRS_* extensions) landed.
**Status:** Phases 4 (Notes + view-states v0.1 round-trip), 5 (originator share flow),
6 (shared cache tier — Drive/Firebase) open.
**Unblocks:** `share-110`, `notes-120`, `view-150` perf wins.
**Pro-MVP impact:** Phase 5 (originator share flow) — required. Phase 4 — required (so
notes survive cache hits). Phase 6 — post-MVP optimisation.

### Track T3: Identity Decoupling
**Docs:** `design/new/identity-decoupling.md` + `identity-decoupling-decisions.md`.
**What:** GitHub as `ConnectionProvider` peer of Drive. Two Netlify Functions for the
OAuth code/refresh exchange; multi-account GitHub support; legacy Auth0-federated path
retained for migration.
**Status:** PR1 (provider scaffolding + Functions) merged. PR2 (SourcesTab UI
integration, recents migration) + PR3 (switchover + flag retire) open.
**Unblocks:** `identity-110`, `identity-120`, `identity-130`, `open-130`,
`share-130`, `subscribe-120` (quota keying), and T4 PR3 (GH sharing).
**Pro-MVP impact:** PR2 + PR3 required.

### Track T4: Multi-User Sharing
**Doc:** `design/new/multi-user-sharing.md` + `design/new/sharing-pr3-github.md`.
**What:** Grants/revoke, visibility, folder-scoped routes; consistent across Drive +
GitHub. Stretch: portable sidecar formats for Notes + Versions, round-trippers to git.
**Status:** PR1 (provider scaffolding) merged. PR2 (Drive Share dialog UI), PR3 (GH
sharing adapter), PR4 (folder boundary routes) open. PR5 (GH token-health parity) and
PR6 (flag retire) follow.
**Unblocks:** `share-120`, `share-130`, `share-140`, `notes-120`, `versions-120`.
**Pro-MVP impact:** PR2 + PR3 required (private sharing is a paid feature). PR4
post-MVP. PR5 nice-to-have.

### Track T5: Drive Recents HEAD-check
**Doc:** `design/new/drive-recents-head-check.md`.
**What:** Pre-flight Drive metadata check on recents click; typed `FileUnreachable`
alert variants.
**Status:** Proposed. Not started.
**Unblocks:** `open-150`. Pattern reusable for GH recents once `githubAsSource` lands.
**Pro-MVP impact:** Polish; not strictly required for paid launch but the support cost
of "Failed to parse model" on dead recents is real.

### Track T6: Notes & Versions sidecar formats
**Doc:** `multi-user-sharing.md` §Stretch (Q1–Q4).
**What:** Provider-neutral JSON sidecar formats for notes + versions, round-tripping
between Drive snapshots and git issues/commits.
**Status:** Not started.
**Unblocks:** `notes-120`, `notes-110` (BCF can be derived), `versions-120`.
**Pro-MVP impact:** Post-MVP. Quarter-scale work.

### Track T7: Ads
**Doc:** `design/new/ads.md` + epic #1524.
**What:** AdSense free-tier monetisation without Auto-ads on viewer routes.
**Status:** Phase 1 activation in flight (#1523). Phases 2–4 outlined.
**Unblocks:** `subscribe-130`.
**Pro-MVP impact:** Phase 1 required (activate publisher account). Phases 2–3 should
land before public launch but can lag a beat.

### Track T8: Pro/Billing (NEW track)
**Doc:** TBD — to be drafted in `design/new/pro-billing.md`.
**What:** Tier definitions, Stripe integration, quota infrastructure, feature-gate
plumbing throughout the app.
**Status:** Not started. Existing seeds: `netlify/functions/create-portal-session.js`,
`netlify/functions/unlink-identity.js` (pattern reuse).
**Unblocks:** `subscribe-100`, `subscribe-110`, `subscribe-120`.
**Pro-MVP impact:** Required end-to-end.


## 5. Pro-MVP plan

Goal: ship the **paid tier** publicly. Free + Pro coexist; anonymous use stays
possible; private sharing + multi-account + quota are paid; ads run on free.

This is a phased plan, not a sprint schedule. Each phase ends with a green CI + a
public canary. Phases 1–2 can overlap; phases 3–5 sequence.


### Phase A: Stabilise the rebuilt viewer (foundation)
**Goal:** the Pro launch can't ship if the viewer regresses on real models.
- T1 remaining slices:
  - `IfcViewsManager` deletion (§3c.iv slice 1).
  - On-demand rendering (dirty-flag) — biggest framerate win available.
  - Per-product Mesh emission spike — measure cost.
- T1 **public-launch gate**: 4-angle screenshot harness + GLB bit-level diff against
  golden artifacts. Runs in CI. This is the "we won't regress on the things that
  worked" insurance.
- Stretch in this phase: hover-pick throttle tuning; subset-pool unification.

**Exit:** screenshot harness green on the fixture corpus; on-demand rendering shipped
default-on.


### Phase B: Identity + Sources, multi-account
**Goal:** the Pro user has a coherent multi-account identity that quota tracking can
hang off.
- T3 PR2 (SourcesTab GitHub integration + recents migration). Behind `githubAsSource`
  flag.
- T3 PR2 follow-up: gate connect actions behind Auth0 primary auth (per decisions doc
  §PR2 "Gate connection actions behind Auth0").
- `identity-120`: #1422 Auth disambiguation chooser.
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
  the Share dialog from `share-150` (#1421) on top.
- `share-120` private link sharing surfaces in the dialog.
- `share-130` people-grants surface in the dialog.
- Retire `sharing` flag once metrics + canary look clean.

**Exit:** a user can click Share on a model, invite a teammate by email/login, and the
teammate opens the link in <2s.


### Phase D: Subscribe
**Goal:** the Pro tier exists and bills.
- T8 design doc (`design/new/pro-billing.md`) drafted first — locks in tier
  definitions before code.
- `subscribe-100` pricing tiers + feature-gate map.
- `subscribe-110` Stripe checkout + portal Netlify Functions. Pattern from
  `unlink-identity.js`.
- `subscribe-120` quota tracking — instrument the three enforcement points (GLB
  upload, refresh-token mint, public-share retention).
- T7 Phase 2 + 3 ad slots on `/about`, `/privacy`, `/tos`, `/blog/*`.
- `subscribe-130` ads wired to free-tier-only gate.
- `share-150` Extended Share dialog (#1421) wires Pro upsell into the share flow.

**Exit:** a free user hits a quota wall and can upgrade in two clicks; ads serve on
text routes only.


### Phase E: Public-launch checklist
**Goal:** the public site is ready for cold traffic.
- T7 Phase 4 (consent gating) if EU consent landscape requires.
- T5 Drive recents HEAD-check (and GH equivalent) — UX polish; reduces "WTF
  failures."
- `community-110` thumbs feedback widget.
- Sentry + GA dashboards confirmed; runbook for typical failure modes.
- Pricing page + ToS + Privacy updated.
- Decision: drop T5 of the legacy Auth0-federated GH path, or leave for one more
  release.

**Exit:** Pro launch announcement.


## 6. Post-MVP backlog (loveable)

Held over for after Phase E. Order roughly reflects current product-pull:

1. **`view-160` ETL / Table view** 🔮 (❤️ Markus). The "10$/mo by itself" loveable.
   Pre-cond mostly done via T1.
2. **`open-140` Multi-IFC overlay session** (#1251). Conway+GLB make this tractable.
3. **`view-130` Persistent visibility URL encoding** (#1250). Last slice on top of
   T1 isolate routing.
4. **`view-140` Selection-based camera + measurement** (#1044, #1047).
5. **T2 Phase 6 Shared cache tier** (Firebase/Drive sidecar).
6. **T4 PR4 Folder-scoped routes**.
7. **`notes-110` BCF round-trip**.
8. **T6 Stretch Q1–Q4 portable notes/versions** for Drive parity with GH.
9. **`view-170` Common view ops**: nav-cube, explode, undo/redo. IDS validation
   separately.
10. **`view-180` Maps-style issues w/filtering** 🔮 — pairs with T6 Q1.
11. **`search-110` Cross-repo search** 🔮 (❤️ Oleg).
12. **`apps-120` Bldrs Integrate (CI server-side IDS)**.
13. **`apps-130` v1.0 Public API + IDE** 🔮.
14. **`search-120` Knowledge Graph** 🔮 (❤️ Johannes).
15. **`versions-110` Diff between versions**.
16. **PDF "Smart Components & Templates"** 🔮 (❤️ Pablo). Massive scope; will warrant
    its own Epic group when started.
17. **PDF "Hangouts" (Miro, FPV, WebXR Bonanza)** — out of scope until use-case
    demand.
18. **PDF "Social Updates" (ActivityPub federation)** — interesting; no current pull.


## 7. Migration to GH issues + wiki

Once this doc lands, the backfill order:

1. **GitHub issues — Epics first.**
   For each Epic in §3 with status 🟡 or ⬜ and `Pro-MVP impact: required`, create an
   `epic`-labeled GH issue with the body content from the Epic block. Stable ID
   becomes the issue title prefix (e.g. `epic: open-130: SourcesTab with parallel GH +
   Drive accounts`). One pass; expect ~12–15 new Epic issues.
2. **GitHub issues — Stories under Epics.**
   For each open story already in #§ (e.g. #1421, #1422, #1250, #1251, #1254, #850,
   #890, #892), use `mcp__github__sub_issue_write` to attach them under the right
   Epic. Re-title for consistency where useful.
3. **GitHub issues — backfill missing stories.**
   For Epics with `Pro-MVP impact: required` but no story coverage, create one story
   per acceptance criterion. Stories enter the queue with the corresponding `epic`
   sub-issue parent.
4. **Wiki rewrite.**
   Replace `Planning:-Requirements` with a public-facing summary derived from §3 of
   this doc. Strip the implementation links and `Pro-MVP impact` rows; keep the
   Epic-by-Epic structure with status. The wiki page becomes the user-facing roadmap.
5. **CLAUDE.md router row.**
   Add a row for this doc to the routing table in `CLAUDE.md` so future assistants
   find it.

I'll draft each batch and review with you before creating GH issues — won't bulk-create
without sign-off.


## 8. Open questions

- **Pro tier feature gate definition.** §3.9 sketches `subscribe-100` but the actual
  list of "this is Pro" features needs your call. Working hypothesis: private link
  sharing, ad-free, multi-account, larger model cache retention, quota uplift. Confirm
  before T8 design doc.
- **Free-tier quota numbers.** Public anonymous share TTL (3 days? 5 days?), public
  hosting size ceiling (PDF #1421 says <10MB), refresh-token-mint rate. Needs a call
  before `subscribe-120`.
- **Auth0 enforcement on Netlify Functions.** Flagged in
  `identity-decoupling-decisions.md` §Open Implementation Details. Needs to be
  resolved before Phase D quota tracking ships (the quota key is meaningless if the
  functions are anonymous).
- **BCF priority.** Industry-credibility win vs. cost. If we want it for Pro-MVP it
  becomes Phase C scope; otherwise it slips to post-MVP per §6 item 7.
- **Maintenance of this doc.** Cadence: bump on every Epic state change? Or quarterly
  rollup? My recommendation: amend per-PR when an Epic moves status; quarterly review
  to catch drift.


## 9. Doc maintenance

- **When an Epic ships:** update its block in §3 from 🟡 → ✔. Move it out of the
  Pro-MVP phase list in §5 if it was there.
- **When a story closes:** add it to the Closed list under its Epic; PR description
  should reference `roadmap.md` if the change moves an Epic state.
- **When a track lands a slice:** update the Status line of the track in §4. If the
  track is "done" it becomes a one-line entry pointing at its design doc.
- **When a new Epic emerges:** add it to §3 under the appropriate verb group with a
  stable ID one above the highest existing in that group (e.g. `open-160`). Don't
  renumber existing IDs.
- **Don't delete done Epics.** They stay in §3 as the historical record of what
  shipped, which is what §6 "Post-MVP backlog" is measured against.
