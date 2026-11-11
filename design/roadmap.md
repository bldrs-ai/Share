# Bldrs Share Roadmap

**Status:** Draft v0.11 — trimmed to a short roadmap; detail moved to issues and design docs
**Date:** 2026-11-10
**Owner:** Pablo
**Source baseline:** `Share Requirements` Google Doc (Aug 2021, last updated Nov 2022); PDF extract is in this repo's history.

This doc is the source of truth for Epic/Story/Track structure. The wiki page
`Planning:-Requirements` and the `epic`-labeled GitHub issues mirror it; when they disagree, this doc wins and the others get updated.

## Status (2026-11-10)

- **Viewer and engine:** rebuilt on Conway-direct with the GLB cache (T1/T2), default-on. The per-model engine worker, render on demand and motion residency are on by default (kill switches `disableEngineWorker`, `disableRenderOnDemand`, `disableMotionResidency`), and hover is drawn on a held frame. Per the owner (2026-11-10), this was tested extensively and gives a mostly smooth frame rate on a ~900 MB IFC, with interactivity during load.
- **Billing and quotas:** live. Stripe (hosted pricing table, portal, webhook, daily reconcile) and the decided paywall: free viewing with no login for local and public models; a free account gets 2 private models per rolling 7 days (open, share and export); Pro has unlimited private models and exports. Rules: `design/new/quotas.md`.
- **GLB export:** entitled to Pro; free users export public models freely and private/local models through the same slots (`design/new/glb-export-premium.md`).
- **Funnel analytics:** landed through subscription events (load outcomes, engaged-use/return, normalized model actions, server-side subscription events). Still open: recipient share-loop attribution, size/complexity segmentation, GA4/Ads configuration (`grow-120`).
- **Ads:** off and parked (per the owner, 2026-11-10); AdSense stays off for a while, possibly permanently (`subscribe-130`, T7).
- **Workspace shell:** projects drawer, TopBar and Profile/Share relocation are shipped behind `?feature=workspace` (`assist-300`). Layout direction decided 2026-11-10: sessions on the left grouped by project, models as tabs (§4.11).
- **AI assistant:** design doc landed (`design/new/ai-workspace.md`); the viewer tool registry v0 is on main behind `?feature=assist` as a dev hook, and a prototype bot sits behind `?feature=bot`. No panel, agent loop or relay yet. The arc stays post-MVP (§7).
- **In flight:** identity/multi-account (T3), private sharing (T4), the remaining half of in-app model switching (`open-205`: session-owned workers, close and eviction, the switch itself), the model-edit substrate (`create-300`; L0 landed).
- **Not started:** `/viewer/*` landing pages, OG link previews, the large-model positioning page (Phase G).
- **MVP bar:** unchanged (§6.0). The paid offer is live; the working view is that the bar is met when users upgrade on their own as features improve. The six open items are in §6.0.

## Relation to the bizdev planning set

Business priority, ICP validation gates and pricing live in the **private** `bldrs-ai/bizdev` planning issues (<a href="https://github.com/bldrs-ai/bizdev/issues/289" target="_blank" rel="noopener noreferrer">bizdev#289</a>–<a href="https://github.com/bldrs-ai/bizdev/issues/336" target="_blank" rel="noopener noreferrer">bizdev#336</a>; convention in bizdev `docs/planning.md`, landed). This roadmap owns technical design and sequencing. Bizdev rows link to the Share epics that implement them, and those epics carry a back-link comment. Bizdev links resolve only for org members.

Where the plans disagree, the decision is tracked as a bizdev `decision` issue and this doc is updated once it is decided.
- **Decided (see the issue):** <a href="https://github.com/bldrs-ai/bizdev/issues/331" target="_blank" rel="noopener noreferrer">bizdev#331</a> paywall axis (shipped rule in §4.9); <a href="https://github.com/bldrs-ai/bizdev/issues/334" target="_blank" rel="noopener noreferrer">bizdev#334</a> Pro price.
- **Open:** <a href="https://github.com/bldrs-ai/bizdev/issues/332" target="_blank" rel="noopener noreferrer">bizdev#332</a> billing timing vs Phase D; <a href="https://github.com/bldrs-ai/bizdev/issues/333" target="_blank" rel="noopener noreferrer">bizdev#333</a> hosting for originator save; <a href="https://github.com/bldrs-ai/bizdev/issues/335" target="_blank" rel="noopener noreferrer">bizdev#335</a> AI/editing work ahead of plan vs bizdev's discovery rule; <a href="https://github.com/bldrs-ai/bizdev/issues/336" target="_blank" rel="noopener noreferrer">bizdev#336</a> channels: Collab repo vs in-app ChannelProvider (`assist-400`).

## 1. Approach

- **Epic** = verb-shaped product capability the user experiences (Open, View, Share, …); one `epic`-labeled issue each.
- **Story** = scoped user-visible feature with E2E (Playwright) coverage as the acceptance gate; one `story`-labeled issue each.
- **Track** = orthogonal subsystem rebuild that unblocks several Epics; each has a design doc in `design/new/`.

§3 is the overview (one row per Epic and Track), §4 the Epic catalogue, §5 the Tracks, §6 the MVP plan, §7 the AI-workspace pivot, §8 the post-MVP backlog.

## 2. Status legend

| Symbol | Meaning |
|---|---|
| ✔ | Done in production. Default-on. E2E covered (or follow-up E2E captured). |
| 🟡 | In flight — PR open, design doc landed, or substantial code written behind a flag. |
| ⬜ | Backlog — defined enough to start, not started. |
| 🔮 | Loveable / post-MVP — held over from PDF's 🥇/❤️ markers or new. |
| 🔒 | Pro gated — free users can see it exists but can't use the full capability. |

From the PDF: 🥉 = MVP, 🥇 = MLP (Minimum Loveable Product), ❤️ = personal MLP (a named person). Those markers are kept in §4. Work added since the PDF is marked `(NEW)`.

### 2.1 Tier rubric (Epic ID numbering)

The hundreds digit of an Epic ID encodes the **business milestone the epic is needed for**, not feature-fanciness: the earliest milestone below that doesn't happen without it. Sub-steps (110, 120, …) order epics within a band.

| Range | Milestone | The bar (qualitative; measured via `grow-120` events — numbers live bizdev-side) |
|---|---|---|
| 100–199 | **MVP** | An initial **trickle of paying customers** — not just the first — arriving steadily, with **CAC estimable** from the Ads funnel (spend ÷ paid conversions) and a steady trickle of signups. |
| 200–299 | **MLP** | Significant strides on that trickle by **building out the basics** — signup/paid growth accelerating at a respectable rate. |
| 300–399 | **Pro** | Confidence stage: **power features** shipping and earning **positive feedback at the feature level**. |
| 400–499 | **Enterprise** | A fully up-and-running business: validated **ideal customer personas**, breadth of positive feedback, org-scale packaging (sovereignty posture, admin, boundaries). |

## 3. Status overview

One row per Epic and Track; bodies are in §4 and §5. **Phase column:** A–E = MVP-plan phases (§6: A stabilise viewer, B identity, C sharing, D subscribe, E launch checklist); G = growth funnel (§6, parallel); AI = pivot arc (§7); — = shipped or not placed; Post = §8 backlog.

### 3.1 Epics

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Open | `open-100` | Open from local file system | ✔ | — | — | |
| Open | `open-110` | Open from GitHub URL / UI | ✔ | — | — | |
| Open | `open-120` | Open from Google Drive | ✔ | — | — | |
| Open | `open-200` | Recents reliability | 🟡 | E | T5 | |
| Open | `open-205` | In-app model switching | 🟡 | AI | T1 | <a href="https://github.com/bldrs-ai/Share/issues/2011" target="_blank" rel="noopener noreferrer">#2011</a> |
| Open | `open-210` | Open multiple IFCs in one session | ⬜ | Post | — | |
| Open | `open-300` | Multi-account Sources tab | 🟡 | B | T3 | |
| View | `view-100` | 3D + NavTree + Properties | ✔ | — | T1, T2 | |
| View | `view-110` | Cut planes | ✔ | — | T1 | |
| View | `view-120` | Shareable camera position | ✔ | — | — | |
| View | `view-130` | Performance + large-model viewing | 🟡 | A | T1, T2 | |
| View | `view-140` | Scoped display controls + shareable display state | 🟡 | C | T1, T2 | <a href="https://github.com/bldrs-ai/Share/issues/1705" target="_blank" rel="noopener noreferrer">#1705</a> |
| View | `view-200` | Persistent visibility / Isolate | 🟡 | Post | T1 | |
| View | `view-210` | Selection-based camera + measurement | ⬜ | Post | — | |
| View | `view-220` | Common view ops (nav-cube, explode, undo, IDS) | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/1881" target="_blank" rel="noopener noreferrer">#1881</a> |
| View | `view-230` | Placemarks + maps-style issues w/filtering (🥇) | 🟡 | C, Post | T1, T6 | |
| View | `view-300` | ETL / Table view (❤️ Markus) | 🔮 | Post | T1 | |
| Share | `share-100` | Share link to current view | ✔ | — | — | |
| Share | `share-110` | Save model to user's hosting (originator share) | 🟡 | C | T2 | |
| Share | `share-120` | Extended Share/Login flow | 🟡 | C, D | — | <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a> |
| Share | `share-130` | Private link sharing + visibility chip | 🟡 | C | T4 | |
| Share | `share-140` | GLB export with Pro entitlement and free model slots | 🟡 | D | T2, T8 | <a href="https://github.com/bldrs-ai/Share/issues/1831" target="_blank" rel="noopener noreferrer">#1831</a> |
| Share | `share-200` | Grant/revoke per-principal sharing | 🟡 | C | T4 | |
| Share | `share-400` | Folder-scoped boundaries | ⬜ | Post | T4 | |
| Notes | `notes-100` | Anchored notes (GitHub-backed) | ✔ | — | — | |
| Notes | `notes-200` | BCF round-trip | ⬜ | Post | — | |
| Notes | `notes-300` | Drive-backed notes (NotesProvider) | 🔮 | Post | T4, T6 | |
| Versions | `versions-100` | Show specific version + branch/commit nav | 🟡 | — | — | |
| Versions | `versions-300` | Diff between versions | ⬜ | Post | — | |
| Versions | `versions-310` | Portable versions for Drive | 🔮 | Post | T6 | |
| Search | `search-100` | Search current model | 🟡 | — | — | |
| Search | `search-300` | Search across GitHub repos (❤️ Oleg) | 🔮 | Post | — | |
| Search | `search-310` | Knowledge graph (🥇, ❤️ Johannes) | 🔮 | AI | T10 | |
| Search | `search-320` | Fluid NavTree + breadcrumb-scoped search (NEW) | ⬜ | AI | — | <a href="https://github.com/bldrs-ai/Share/issues/1658" target="_blank" rel="noopener noreferrer">#1658</a> |
| Identity | `identity-100` | Auth0 primary login | ✔ | — | — | |
| Identity | `identity-110` | GitHub as Sources peer | 🟡 | B | T3 | |
| Identity | `identity-120` | Auth disambiguation | 🟡 | B | — | <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a> |
| Identity | `identity-300` | Profile drawer + multi-account picker | ⬜ | B | T3 | <a href="https://github.com/bldrs-ai/Share/issues/2048" target="_blank" rel="noopener noreferrer">#2048</a> (consent) |
| Apps | `apps-100` | Browse + select app (AppsDrawer) | ✔ | — | — | |
| Apps | `apps-110` | XYZ demo app (v0.1 API dogfood) | ✔ | — | — | |
| Apps | `apps-300` | v1.0 Public API + IDE (🥇) | 🔮 | AI | T11 | |
| Apps | `apps-310` | Bldrs Integrate (CI + ArchiCAD/Speckle) | 🔮 | AI | T11 | |
| Community | `community-100` | Welcome dialog + onboarding | ✔ | — | — | |
| Community | `community-110` | Analytics + survey + thumbs feedback | 🟡 | E | — | |
| Community | `community-200` | Bug report w/ screenshot + session state | ⬜ | Post | — | |
| Community | `community-210` | AEC outreach (🥇) | 🔮 | Post | — | |
| Subscribe | `subscribe-100` | Pricing tiers + feature manager (NEW) | ✔ | D | T8 | |
| Subscribe | `subscribe-110` | Stripe checkout + portal (NEW) | ✔ | D | T8 | |
| Subscribe | `subscribe-120` | Quota tracking (NEW) | ✔ | D | T8, T3 | |
| Subscribe | `subscribe-130` | Ads on free tier | 🔮 | D | T7 | <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a> |
| Subscribe | `subscribe-400` | Enterprise tier definition (NEW) | ⬜ | Post | T8 | |
| Grow | `grow-100` | SEO format landing pages `/viewer/*` (NEW) | ⬜ | G | T9 | |
| Grow | `grow-120` | Funnel instrumentation + GA hygiene (NEW) | 🟡 | G | T9 | |
| Grow | `grow-200` | Rich share-link previews / OG cards (NEW) | ⬜ | G | T9 | |
| Grow | `grow-400` | Large-model + data-sovereignty positioning (NEW) | ⬜ | G | T9 | |
| Assist | `assist-300` | Workspace shell: left drawer projects + org nav (NEW) | 🟡 | AI | — | <a href="https://github.com/bldrs-ai/Share/issues/1657" target="_blank" rel="noopener noreferrer">#1657</a> |
| Assist | `assist-310` | Conversational agent panel, single-user (NEW) | 🟡 | AI | T10, T11 | <a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a> |
| Assist | `assist-320` | AI-apps toolbelt: save/version/run + MCP (NEW) | ⬜ | AI | T11 | |
| Assist | `assist-400` | Multi-user channels + AI participation modes (NEW) | ⬜ | AI | T10 | <a href="https://github.com/bldrs-ai/Share/issues/1660" target="_blank" rel="noopener noreferrer">#1660</a> |
| Create | `create-300` | Model edit substrate: CRUD over an op log (NEW) | 🟡 | AI | T12 | <a href="https://github.com/bldrs-ai/Share/issues/1914" target="_blank" rel="noopener noreferrer">#1914</a> |
| Create | `create-310` | Agent write tools (NEW) | ⬜ | AI | T11, T12 | <a href="https://github.com/bldrs-ai/Share/issues/1919" target="_blank" rel="noopener noreferrer">#1919</a> |
| Create | `create-320` | Generative model creation: engine selection (NEW) | ⬜ | AI | T12 | <a href="https://github.com/bldrs-ai/Share/issues/1920" target="_blank" rel="noopener noreferrer">#1920</a> |

### 3.2 Tracks

| ID | Name | Status | Phase | Unblocks |
|---|---|---|---|---|
| T1 | Viewer Replacement | 🟡 | A (launch gate) | `view-100`, `view-110`, `view-200`, `view-130`, `view-300`, `open-205`, T2 |
| T2 | GLB Model Sharing | 🟡 | C (Ph 4 + 5) | `share-110`, `notes-300`, `view-130` |
| T3 | Identity Decoupling | 🟡 | B (PR2 + PR3) | `identity-110`, `identity-120`, `identity-300`, `open-300`, `share-200`, `subscribe-120`, T4 PR3 |
| T4 | Multi-User Sharing | 🟡 | C (PR2 + PR3) | `share-130`, `share-200`, `share-400`, `notes-300`, `versions-310` |
| T5 | Drive Recents HEAD-check | ⬜ | E (polish) | `open-200` |
| T6 | Notes & Versions sidecar formats | ⬜ | Post | `notes-200`, `notes-300`, `versions-310` |
| T7 | Ads | 🔮 | D | `subscribe-130` |
| T8 | Pro/Billing (NEW) | 🟡 | D | `subscribe-100`, `subscribe-110`, `subscribe-120`, §7 AI metering |
| T9 | Growth funnel & SEO surfaces (NEW) | 🟡 | G | `grow-100`, `grow-200`, `grow-120` |
| T10 | Agent runtime & conversation store (NEW) | 🟡 | AI (§7) | `assist-310`, `assist-400`, `search-310` |
| T11 | App sandbox + MCP bridge (NEW) | 🟡 | AI (§7) | `assist-320`, `apps-300`, `apps-310` |
| T12 | Model edit substrate (NEW) | 🟡 | AI (§7) | `create-300`, `create-310`, `create-320`, §7.4 AI.5 |

## 4. Epic catalogue

Compact by design: ✔ epics are one line; open epics say what the capability is, what remains (outcomes, not tasks), the tracking issue and design doc. Task-level detail lives in the issues.

### 4.1 Open

User can open a model from local, cloud, or shared link, with format breadth and multi-model composition.

- `open-100` Open from local file system ✔. `open-110` Open from GitHub URL / UI ✔. `open-120` Open from Google Drive ✔ (Drive Save is under `share-110`).
- **`open-200` Recents reliability** 🟡 (NEW). A dead recent (Drive, GitHub or local) should show a typed "file no longer available" alert, not a parse failure. Not started (T5, `design/new/drive-recents-head-check.md`); <a href="https://github.com/bldrs-ai/Share/issues/1548" target="_blank" rel="noopener noreferrer">#1548</a> (local recent after cache clear) is closed (as of 2026-11-10). Polish for Phase E, not MVP-load-bearing.
- **`open-205` In-app model switching** 🟡 (NEW). Open a model without a page reload; each model gets its own session and engine, and only close or memory eviction cancels a load. Epic <a href="https://github.com/bldrs-ai/Share/issues/2011" target="_blank" rel="noopener noreferrer">#2011</a>; Phase 0 (<a href="https://github.com/bldrs-ai/Share/issues/2012" target="_blank" rel="noopener noreferrer">#2012</a>) is closed (as of 2026-11-10). The engine-worker half has landed (per-model worker, on by default). Still to build: sessions owning their worker, close and eviction, and the switch itself (Phase 1, behind `?feature=spaModelNav`), Phase 2 multi-model groundwork (<a href="https://github.com/bldrs-ai/Share/issues/2024" target="_blank" rel="noopener noreferrer">#2024</a>), plus off-main-thread rendering under <a href="https://github.com/bldrs-ai/Share/issues/2055" target="_blank" rel="noopener noreferrer">#2055</a>. Prerequisite of `open-210` and `assist-300`; the tabbed workspace layout (below, `assist-300`) depends on it. Docs: `design/new/in-app-model-switch.md`, `engine-worker.md`, `offscreen-rendering.md`.
- **`open-210` Open multiple IFCs in one session** ⬜. Import and overlay several models (<a href="https://github.com/bldrs-ai/Share/issues/1251" target="_blank" rel="noopener noreferrer">#1251</a>); now a UI and state problem, not an engine problem. **Post-MVP.**
- **`open-300` Multi-account Sources tab** 🟡. Drive multi-account works; parallel GitHub accounts arrive with T3 PR2/PR3 (Phase B).

### 4.2 View

User can inspect the model in 3D with the navigation, properties, search-by-element, slice, and isolation controls expected of a BIM viewer.

- `view-100` 3D + NavTree + Properties ✔ (incl. STEP occurrence-keyed selection and permalinks; follow-ups under Phase A: <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a>, <a href="https://github.com/bldrs-ai/Share/issues/1570" target="_blank" rel="noopener noreferrer">#1570</a>, <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a>). `view-110` Cut planes ✔ (surface-aligned cut UI <a href="https://github.com/bldrs-ai/Share/issues/1045" target="_blank" rel="noopener noreferrer">#1045</a> is post-MVP polish). `view-120` Shareable camera position ✔.
- **`view-130` Performance + large-model viewing** 🟡. Fast re-open and large-model handling via the OPFS/GLB cache, Conway-direct, GPU instancing, residency and a per-model engine worker (default-on; render-on-demand and motion residency default-on, PR <a href="https://github.com/bldrs-ai/Share/pull/2104" target="_blank" rel="noopener noreferrer">#2104</a>, as of 2026-11-10; hover is drawn on a held frame). Tested extensively per the owner (2026-11-10): mostly smooth frame rate on a ~900 MB IFC, with interactivity during load. Streaming-loader work (faster loads, lower memory, interactivity during load) is tracked as a T1 sub-track, <a href="https://github.com/bldrs-ai/Share/issues/1601" target="_blank" rel="noopener noreferrer">#1601</a>. Remaining: the **public-launch gate** (4-angle screenshot harness + GLB bit-level diff; **Required for MVP**), flag-flip decisions (`batchedMesh` always-on, `?feature=look` default-on), residency for non-batched formats (planned as `view-140` S6), real geometry release (<a href="https://github.com/bldrs-ai/Share/issues/1913" target="_blank" rel="noopener noreferrer">#1913</a>). Docs: `viewer-replacement.md`, `demand-tiled-rendering.md`, `engine-worker.md`.
- **`view-140` Scoped display controls + shareable display state** 🟡. Auto-color toggle, wireframe and residency applied to a scope (model, sub-tree, part, mesh), carried in permalinks via a `#d:` token that absorbs `view-200`'s <a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a>. `displayControls` and `glbBatched` are default-on (as of 2026-08-28); the remainder (the `#d:` token, scoped residency) is open. Epic <a href="https://github.com/bldrs-ai/Share/issues/1705" target="_blank" rel="noopener noreferrer">#1705</a>; `design/new/model-display-controls.md`.
- **`view-200` Persistent visibility / Isolate** 🟡. Remaining slice is URL persistence, planned as part of `view-140`'s `#d:` token (<a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a>); its remaining slice is tracked under `view-140` (<a href="https://github.com/bldrs-ai/Share/issues/1705" target="_blank" rel="noopener noreferrer">#1705</a>). Post-MVP.
- **`view-210` Selection-based camera + measurement** ⬜ (<a href="https://github.com/bldrs-ai/Share/issues/1044" target="_blank" rel="noopener noreferrer">#1044</a>, <a href="https://github.com/bldrs-ai/Share/issues/1047" target="_blank" rel="noopener noreferrer">#1047</a>). **Post-MVP.**
- **`view-220` Common view operations** ⬜. Nav-cube, explode, undo/redo, IDS rules. Epic <a href="https://github.com/bldrs-ai/Share/issues/1881" target="_blank" rel="noopener noreferrer">#1881</a>. **Post-MVP.**
- **`view-230` Placemarks + maps-style issues view** 🟡 (🥇). The pin primitive (`#m:x,y,z`, transient or anchored to a Note) is largely built behind `?feature=placemark`; the Google-Maps-style filtering UI on top is not started. Polish (<a href="https://github.com/bldrs-ai/Share/issues/929" target="_blank" rel="noopener noreferrer">#929</a>, <a href="https://github.com/bldrs-ai/Share/issues/930" target="_blank" rel="noopener noreferrer">#930</a>, <a href="https://github.com/bldrs-ai/Share/issues/931" target="_blank" rel="noopener noreferrer">#931</a>, <a href="https://github.com/bldrs-ai/Share/issues/932" target="_blank" rel="noopener noreferrer">#932</a>, <a href="https://github.com/bldrs-ai/Share/issues/985" target="_blank" rel="noopener noreferrer">#985</a>, <a href="https://github.com/bldrs-ai/Share/issues/998" target="_blank" rel="noopener noreferrer">#998</a>, <a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a>) is a Phase C candidate; <a href="https://github.com/bldrs-ai/Share/issues/930" target="_blank" rel="noopener noreferrer">#930</a> blocks the share-a-note flow. Filtering UI is **Post-MVP** (§8).
- **`view-300` ETL / Table view** 🔮 (❤️ Markus). Select a subset, choose attributes, export CSV or stream to an API. **Post-MVP.**

### 4.3 Share

User shares a model, a view, a note, or a region with another user — privately or publicly — and the recipient sees what was intended.

- `share-100` Share link to current view ✔.
- **`share-110` Save model to user's hosting** 🟡. Originator-side persistence: Drive Save mirroring GitHub Save, then the originator share flow (T2 Phase 5). Phase C; part of the MVP paid offer.
- **`share-120` Extended Share/Login flow** 🟡 (NEW). The dialog that picks between anonymous-public, free-public, and Pro-private; where the upgrade prompt lives. Share gate for local uploads has landed. <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>. **Required for MVP.**
- **`share-130` Private link sharing + visibility chip** 🟡 (NEW). T4 PR1 landed; the Share dialog (PR2/PR3) remains; `sharing` flag is off. **Required for MVP** (private sharing is a paid feature).
- **`share-140` GLB export with Pro entitlement and free model slots** 🟡 (NEW). Shipped and default-on; Pro exports unlimited, free users use public models freely and private/local models through their model slots. Remaining: residual manual cross-browser smoke checks. Epic <a href="https://github.com/bldrs-ai/Share/issues/1831" target="_blank" rel="noopener noreferrer">#1831</a>; rules in `design/new/quotas.md` and `design/new/glb-export-premium.md`.
- **`share-200` Grant/revoke per-principal sharing** 🟡 (NEW). People panel in the Share dialog (T4 PR2/PR3); MLP band, not load-bearing for the trickle.
- **`share-400` Folder-scoped boundaries** ⬜ (NEW). T4 PR4. **Post-MVP.**

### 4.4 Notes & Versions

User leaves comments anchored to model elements, replies in a thread, and can revisit a specific version of the model.

- `notes-100` Anchored notes (GitHub-backed) ✔ (anchoring flow <a href="https://github.com/bldrs-ai/Share/issues/892" target="_blank" rel="noopener noreferrer">#892</a> is tracked under `view-230`).
- **`notes-200` BCF round-trip** ⬜. Issues interoperate with Solibri/Navisworks/Tekla. **Post-MVP.**
- **`notes-300` Drive-backed notes (NotesProvider)** 🔮 (NEW). T4 Stretch. **Post-MVP.**
- **`versions-100` Show specific version + branch/commit nav** 🟡. Enough for the free tier; open: <a href="https://github.com/bldrs-ai/Share/issues/850" target="_blank" rel="noopener noreferrer">#850</a>, <a href="https://github.com/bldrs-ai/Share/issues/890" target="_blank" rel="noopener noreferrer">#890</a>. Polish post-MVP.
- **`versions-300` Diff between versions** ⬜. Needs a structural IFC diff. **Post-MVP.**
- **`versions-310` Portable versions for Drive** 🔮 (NEW). T4 Stretch Q3. **Post-MVP.**

### 4.5 Search

User finds elements in the current model, across their repos, or across the building data graph.

- **`search-100` Search current model** 🟡. Permalinks done; search by element name with scene highlighting (<a href="https://github.com/bldrs-ai/Share/issues/1254" target="_blank" rel="noopener noreferrer">#1254</a>) folds into `search-320`.
- **`search-300` Search across GitHub repos** 🔮 (❤️ Oleg). **Post-MVP.**
- **`search-310` Knowledge graph / ask questions** 🔮 (🥇, ❤️ Johannes). Absorbed by the AI pivot (§7): natural-language QA is the job of `assist-310`; the graph becomes its retrieval layer (T10).
- **`search-320` Fluid NavTree + breadcrumb-scoped search** ⬜ (NEW). NavTree becomes a summonable, type-to-filter dropdown from the TopBar breadcrumb; selection and permalinks round-trip unchanged. Epic <a href="https://github.com/bldrs-ai/Share/issues/1658" target="_blank" rel="noopener noreferrer">#1658</a>; `?feature=navSearch`; stage AI.1a (§7.4); `design/new/conversational-cad.md` §3.

### 4.6 Identity & Account (NEW group)

User signs in, links data sources, and the system honors that even across primary-auth changes.

- `identity-100` Auth0 primary login ✔.
- **`identity-110` GitHub as a Sources peer** 🟡. T3 PR1 landed; SourcesTab integration and switchover (PR2/PR3) remain, behind `githubAsSource`. **Required for MVP.**
- **`identity-120` Auth disambiguation across linked identities** 🟡. Chooser for prior identities so users with two GitHub accounts know what they are billed under. <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a>. **Required for MVP.**
- **`identity-300` Profile drawer + multi-account picker** ⬜. Includes the "Saving as X — GitHub" footer. Analytics consent (<a href="https://github.com/bldrs-ai/Share/issues/2048" target="_blank" rel="noopener noreferrer">#2048</a>) is a child story, grouped with Profile. **Required for MVP.**

### 4.7 Apps

Third-party (and dogfooded) apps add capabilities to Share via a stable API.

- `apps-100` Browse + select app (AppsDrawer) ✔ (seed of the `assist-320` toolbelt; its broken iframe integration <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> is a pivot blocker, §7.4 AI.0). `apps-110` XYZ demo app ✔.
- **`apps-300` v1.0 Public API + IDE** 🔮 (🥇). Re-scoped by the pivot: designed MCP-first (T11), shared with the in-app agent.
- **`apps-310` Bldrs Integrate (CI + ArchiCAD/Speckle)** 🔮. Absorbed by the pivot: agent-run model checks as toolbelt apps.

### 4.8 Community & Onboarding

User finds out about Bldrs, gets oriented, leaves feedback, and finds product help.

- `community-100` Welcome dialog + onboarding ✔.
- **`community-110` Analytics + survey + thumbs feedback** 🟡. Analytics shipped; the 👍/👎 exit widget and survey link remain. **MVP impact:** one feedback affordance is needed for public launch (Phase E).
- **`community-200` Bug report w/ screenshot + session state** ⬜. **Post-MVP** unless support burden demands it earlier.
- **`community-210` AEC outreach** 🔮 (🥇, ❤️ Kate?). Out of repo scope; owned by the bizdev growth-strategy doc. In-repo dependency: Phase G instrumentation lands first.

### 4.9 Subscribe (NEW group)

User upgrades from free to Pro, the system tracks quota, and Pro-only features become available. Origin: the Pro mock in <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>; nothing in the PDF.

**The shipped rule is the decided paywall:** free viewing with no login for local and public models; a free account with 2 private models per rolling 7 days (open, share and export on those); Pro with unlimited private models and exports (`design/new/quotas.md`, the pricing page). The v0.4 size/complexity axis (quota by model size, never by model count) was a proposal and was not adopted. Decision: <a href="https://github.com/bldrs-ai/bizdev/issues/331" target="_blank" rel="noopener noreferrer">bizdev#331</a>.

- **`subscribe-100` Pricing tiers + feature manager** ✔ (NEW). Free/Pro tiers and the public pricing page follow the enforced constants, and pricing copy is generated from them; signed-out users are never metered. The `tier`-aware capability map was never built and is dropped from scope. **Required for MVP; done.**
- **`subscribe-110` Stripe checkout + portal** ✔ (NEW). Live: checkout uses Stripe's hosted pricing table; portal, webhook entitlement into Auth0 and a daily reconcile sweep (`design/new/netlify-functions-testing.md`). Server-side subscription events landed; GA4/Ads-side verification is tracked under `grow-120`. **Required for MVP; done.**
- **`subscribe-120` Quota tracking** ✔ (NEW). Live: server-side private-model slot ledger keyed by Auth0 `sub`, rolling 7-day window, on by default; also decides free export slots. Local viewing is unmetered. **Required for MVP; done.** Rules: `design/new/quotas.md`.
- **`subscribe-130` Ads on free tier** 🔮. **Parked** (per the owner, 2026-11-10): AdSense is off and stays off for a while, possibly permanently. Phase 1 was activated (<a href="https://github.com/bldrs-ai/Share/issues/1523" target="_blank" rel="noopener noreferrer">#1523</a>), then the script tag was removed and ad-free routes enforced (<a href="https://github.com/bldrs-ai/Share/pull/1890" target="_blank" rel="noopener noreferrer">#1890</a>); off since then. T7, epic <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a>; record in `design/new/ads.md`. Not part of the MVP bar. Acquisition campaigns are bizdev-owned and need `grow-100` pages and `grow-120` events.
- **`subscribe-400` Enterprise tier definition** ⬜ (NEW). Thin placeholder: productised data-sovereignty posture, org admin, folder boundaries (`share-400`), SSO; waits for a design partner. **Post-MVP**; its marketing face (`grow-400`) ships in Phase G.

### 4.10 Grow (NEW group)

Users find Bldrs without paying for every visit, and shared links convert recipients into new users (see the Changelog, v0.3, for the growth conclusions). Quantitative targets live in the **private** bizdev docs. This group is free-tier demand-gen and measurement and stays cheap; the audience that pays gets its own surface (`grow-400`).

- **`grow-100` SEO format landing pages** ⬜ (NEW). Static `/viewer/<format>` pages (IFC and STEP first) on the marketing SSG build, targeting "open X file online" and serving as paid-search destinations; demo deep links exist for IFC and STEP. **Phase G.**
- **`grow-120` Funnel instrumentation + analytics hygiene** 🟡 (NEW). Landed: GA hygiene, load outcomes, engaged-use/return conversions, normalized model actions by tier, and server-side subscription events. Remaining: recipient share-loop attribution (`share_link_created`, `share_link_opened`, `model_interacted`); size/complexity segmentation on model-open; GA4/Ads-side configuration and verification. Event grid: `design/new/quotas.md` §"Funnel analytics". **Phase G, first slice.**
- **`grow-200` Rich share-link previews (OG cards)** ⬜ (NEW). Shared `/share/*` links unfurl with a thumbnail and title; recipients get an "Open your own model" affordance. Mechanism is an open question (§10). Supersedes <a href="https://github.com/bldrs-ai/Share/issues/1315" target="_blank" rel="noopener noreferrer">#1315</a>. **Phase G**; OG image may slip to Phase C.
- **`grow-400` Large-model + data-sovereignty positioning** ⬜ (NEW). A marketing page for the audience that pays, leading with "AI iterates on models nobody else can even open" and the no-upload story, with a large-model demo link. **Phase G**; refreshed at AI.2.

### 4.11 Assist (NEW group — the AI workspace)

User works with an AI agent on their models, collaborates with teammates in the same conversation, and accumulates AI-built tools. Epic-level decomposition of §7. Design doc landed (as of 2026-11-10): `design/new/ai-workspace.md`; epic plan: `design/new/conversational-cad.md`.

- **`assist-300` Workspace shell** 🟡 (NEW). UI/routing only, no AI dependency; `?feature=workspace`. Shipped behind the flag: ProjectsDrawer (<a href="https://github.com/bldrs-ai/Share/issues/1661" target="_blank" rel="noopener noreferrer">#1661</a>), TopBar (<a href="https://github.com/bldrs-ai/Share/issues/1663" target="_blank" rel="noopener noreferrer">#1663</a>), Profile/Share relocation (<a href="https://github.com/bldrs-ai/Share/issues/1665" target="_blank" rel="noopener noreferrer">#1665</a>); open: <a href="https://github.com/bldrs-ai/Share/issues/1662" target="_blank" rel="noopener noreferrer">#1662</a>, <a href="https://github.com/bldrs-ai/Share/issues/1664" target="_blank" rel="noopener noreferrer">#1664</a>, <a href="https://github.com/bldrs-ai/Share/issues/1666" target="_blank" rel="noopener noreferrer">#1666</a>, <a href="https://github.com/bldrs-ai/Share/issues/1667" target="_blank" rel="noopener noreferrer">#1667</a>. Layout direction decided 2026-11-10 (per the owner): sessions on the left grouped by project, with multiple models as tabs, each holding the three-part inner layout, replacing project → models in the drawer; owned by `design/new/conversational-cad.md` §2.9. Epic <a href="https://github.com/bldrs-ai/Share/issues/1657" target="_blank" rel="noopener noreferrer">#1657</a>.
- **`assist-310` Conversational agent panel (single-user)** 🟡 (NEW). Claude-Code-like panel over the open model, driving a viewer MCP tool surface (T11); the demo that sells the pivot (AI.2). Absorbs `search-310`. Design doc done (<a href="https://github.com/bldrs-ai/Share/issues/1671" target="_blank" rel="noopener noreferrer">#1671</a> closed); the Assist package boundary and viewer tool registry v0 are on main behind `?feature=assist` (dev hook), and a prototype bot sits behind `?feature=bot`. No tray, agent loop or relay yet. Epic <a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a>; `?feature=assist`.
- **`assist-320` AI-apps toolbelt (right drawer)** ⬜ (NEW). Agent-generated apps saved, versioned and run in a sandboxed iframe over an MCP bridge (T11). Needs <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> fixed first.
- **`assist-400` Multi-user channels + AI participation modes** ⬜ (NEW). Direct address to the AI is a command; general channel talk is human-to-human and the AI may only comment. Needs a shared conversation store (T10) and T4 grants; last in the sequence. Epic <a href="https://github.com/bldrs-ai/Share/issues/1660" target="_blank" rel="noopener noreferrer">#1660</a>.

### 4.12 Create (NEW group — editing and generating models)

User changes the model, not just the view of it, by hand or through the agent. Built as an op log over the immutable source (T12), so it does not wait for an engine write path. Plan: `design/new/model-edit.md`.

- **`create-300` Model edit substrate: CRUD over an op log** 🟡 (NEW). L0 mutation-safe batches (<a href="https://github.com/bldrs-ai/Share/issues/1915" target="_blank" rel="noopener noreferrer">#1915</a>) closed (as of 2026-11-10); op log + undo/redo (<a href="https://github.com/bldrs-ai/Share/issues/1916" target="_blank" rel="noopener noreferrer">#1916</a>), apply backends (<a href="https://github.com/bldrs-ai/Share/issues/1917" target="_blank" rel="noopener noreferrer">#1917</a>) and persistence/replay (<a href="https://github.com/bldrs-ai/Share/issues/1918" target="_blank" rel="noopener noreferrer">#1918</a>) remain; `?feature=edit`. Epic <a href="https://github.com/bldrs-ai/Share/issues/1914" target="_blank" rel="noopener noreferrer">#1914</a>.
- **`create-310` Agent write tools** ⬜ (NEW). The agent writes `create-300` ops, never scene code, so agent actions are undoable and reviewable. Epic <a href="https://github.com/bldrs-ai/Share/issues/1919" target="_blank" rel="noopener noreferrer">#1919</a>.
- **`create-320` Generative model creation: engine selection** ⬜ (NEW). Prompt to model via `create` ops; evaluation (<a href="https://github.com/bldrs-ai/Share/issues/1921" target="_blank" rel="noopener noreferrer">#1921</a>, closed) recommends IFC-shaped extrusions first, embedded OpenSCAD WASM second (`design/new/create-engine.md`). Epic <a href="https://github.com/bldrs-ai/Share/issues/1920" target="_blank" rel="noopener noreferrer">#1920</a>.

## 5. Cross-cutting Tracks

Each track has a long-form design doc.

### Track T1: Viewer Replacement
- **What:** Replace `web-ifc-viewer`/`web-ifc-three` with Conway-direct IFC and STEP parsing, per-instance picking and GPU instancing.
- **Status:** Phases 0–5b landed; `conwayDirectIfc` and `glb` default-on; adapter shim retired. The per-model engine worker is on by default (kill switch `disableEngineWorker`), render on demand and motion residency are on by default, and hover is drawn on a held frame; per the owner (2026-11-10) this was tested extensively and gives a mostly smooth frame rate on a ~900 MB IFC with interactivity during load. Remaining: public-launch test gate, flag flips (`batchedMesh`, `look`). Not built: sessions owning their worker, close and eviction, the live-worker cap, in-app switching. `open-205` rides on this: the engine-worker half landed; session-owned workers, close/eviction and the switch remain.
- **MVP impact:** Required (public-launch gate).
- **Sub-track: streaming loader (<a href="https://github.com/bldrs-ai/Share/issues/1601" target="_blank" rel="noopener noreferrer">#1601</a>).** The faster-loads work (per the owner, 2026-11-10): lower memory use, interactivity during load, and the lowest latency until a user or an AI agent can engage with the model. Open children include <a href="https://github.com/bldrs-ai/Share/issues/1602" target="_blank" rel="noopener noreferrer">#1602</a>, <a href="https://github.com/bldrs-ai/Share/issues/1603" target="_blank" rel="noopener noreferrer">#1603</a>, <a href="https://github.com/bldrs-ai/Share/issues/1604" target="_blank" rel="noopener noreferrer">#1604</a>.
- **Doc:** `design/new/viewer-replacement.md`.

### Track T2: GLB Model Sharing
- **What:** Content-addressed GLB cache plus originator-side share.
- **Status:** Phases 0–3 landed; 4 (notes + view-states in the artifact), 5 (originator share flow), 6 (shared cache tier) open.
- **MVP impact:** Phases 4 and 5 required; Phase 6 post-MVP.
- **Doc:** `design/new/glb-model-sharing.md`.

### Track T3: Identity Decoupling
- **What:** GitHub as a `ConnectionProvider` peer of Drive; multi-account GitHub.
- **Status:** PR1 merged; PR2 (SourcesTab) and PR3 (switchover, flag retire) open.
- **MVP impact:** PR2 + PR3 required.
- **Docs:** `design/new/identity-decoupling.md`, `identity-decoupling-decisions.md`.

### Track T4: Multi-User Sharing
- **What:** Grants, visibility and folder-scoped routes, consistent across Drive and GitHub.
- **Status:** PR1 merged; PR2 (Drive Share dialog), PR3 (GitHub adapter), PR4 (folder routes) open; PR5 (token-health parity) and PR6 (flag retire) follow.
- **MVP impact:** PR2 + PR3 required; PR4 post-MVP.
- **Docs:** `design/new/multi-user-sharing.md`, `sharing-pr3-github.md`.

### Track T5: Drive Recents HEAD-check
- **What:** Pre-flight metadata check on recents click with typed "unreachable" alerts.
- **Status:** Proposed, not started.
- **MVP impact:** Polish.
- **Doc:** `design/new/drive-recents-head-check.md`.

### Track T6: Notes & Versions sidecar formats
- **What:** Provider-neutral JSON sidecars for notes and versions across Drive and git.
- **Status:** Not started.
- **MVP impact:** Post-MVP.
- **Doc:** `design/new/multi-user-sharing.md` §Stretch.

### Track T7: Ads
- **What:** AdSense free-tier monetisation without Auto-ads on viewer routes.
- **Status:** Parked (per the owner, 2026-11-10). Phase 1 was activated (<a href="https://github.com/bldrs-ai/Share/issues/1523" target="_blank" rel="noopener noreferrer">#1523</a>), then the script tag was removed and ad-free routes enforced (<a href="https://github.com/bldrs-ai/Share/pull/1890" target="_blank" rel="noopener noreferrer">#1890</a>); AdSense is off since then, for a while and possibly permanently. Phases 2–4 are not planned.
- **MVP impact:** None while parked.
- **Doc:** `design/new/ads.md`; epic <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a>.

### Track T8: Pro/Billing (NEW)
- **What:** Tier definitions, Stripe, quota infrastructure and feature gates; also the metering rails for §7 AI usage.
- **Status:** Tiers, Stripe to Auth0 entitlement, portal, reconcile, default-on private-model quotas, GLB export entitlement and server-side subscription events are live; the three `subscribe-1x0` epics are done. Remaining: AI metering for §7 (not started), the only reason it stays 🟡. The size/complexity axis was not adopted (§4.9). 
- **MVP impact:** Required end to end.
- **Doc:** `design/new/quotas.md`, `design/new/glb-export-premium.md`, `design/new/netlify-functions-testing.md`; no separate billing doc is planned.

### Track T9: Growth funnel & SEO surfaces (NEW)
- **What:** Funnel events, analytics hygiene, OG metadata, `/viewer/<format>` pages and the `grow-400` page, on the marketing SSG build.
- **Status:** In flight: most events landed (§4.10); share-loop attribution, size segmentation, landing pages and OG cards remain.
- **MVP impact:** Phase G, parallel; the only work that grows the top of the funnel.
- **Docs:** `design/new/ads.md` (on-site ads); strategy and numbers are in the private bizdev docs.

### Track T10: Agent runtime & conversation store (NEW)
- **What:** The agent loop (LLM calls, tool dispatch, streaming), conversation persistence, and the shared store for `assist-400`.
- **Status:** Design landed (`ai-workspace.md`); runtime placement decided (§10). Package boundary and tool registry v0 are on main behind a flag; the prototype bot behind `?feature=bot` is still on the legacy eval path and routed to the main-thread engine. Agent loop, providers, hosted relay and credits are not built. Conversation store: undecided, now tied to the sessions layout decision (§10).
- **MVP impact:** None (pivot arc); must not destabilise Phases A–E.
- **Doc:** `design/new/ai-workspace.md`.

### Track T11: App sandbox + MCP bridge (NEW)
- **What:** The viewer's operations as one MCP tool surface for the in-process agent and sandboxed iframe apps; write tools ride the same contract (T12).
- **Status:** The in-page MCP-shaped tool registry v0 exists on main behind `?feature=assist`. The sandbox and the postMessage bridge are not started; seeds are `WidgetApi/`, AppsDrawer and the `IfcModelService` query surface. <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> repair is still the precondition.
- **MVP impact:** None, except the <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> repair.
- **Doc:** `design/new/ai-workspace.md`.

### Track T12: Model edit substrate (NEW)
- **What:** Edits as an op log over the immutable source: mutation-safe batches, undo/redo, apply backends, persisted replay. IFC/STEP export of edits waits on a Conway writer.
- **Status:** In flight; design doc landed; L0 (<a href="https://github.com/bldrs-ai/Share/issues/1915" target="_blank" rel="noopener noreferrer">#1915</a>) closed (as of 2026-11-10).
- **MVP impact:** None (pivot arc), behind `?feature=edit`.
- **Docs:** `design/new/model-edit.md`, `design/new/create-engine.md`.

## 6. MVP plan

Goal: ship the **paid tier** publicly. Free and Pro coexist; anonymous use stays possible; private sharing, multi-account and quota are paid. (Called the "Pro-MVP plan" before v0.6.) Phases A–B can overlap; C–E sequence; **Phase G runs in parallel, starting now.**

### 6.0 The MVP bar

MVP is a milestone, not a launch event: **a steady trickle of paying customers, arriving week after week without hand-holding, with CAC estimable as ad spend ÷ paid conversions from the `grow-120` funnel, on top of a steady trickle of signups.** One paying customer is an anecdote; the trickle is the evidence. Targets live in the private bizdev docs.

*2026-11-10 (per the owner):* the paid offer is live, and the working view is that the bar is met when users upgrade on their own as features improve, so the open question is which feature earns the first upgrades rather than further gating.

The open 100-band work, exhaustively — this list is the MVP:

1. **The viewer holds** (Phase A): T1 public-launch gate, <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a>, STEP verification <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a>. (<a href="https://github.com/bldrs-ai/Share/issues/1561" target="_blank" rel="noopener noreferrer">#1561</a> and <a href="https://github.com/bldrs-ai/Share/issues/1545" target="_blank" rel="noopener noreferrer">#1545</a> closed; on-demand rendering shipped, as of 2026-11-10.)
2. **Identity is billable** (Phase B): T3 PR2/PR3 (`identity-110`) and <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a> (`identity-120`), so the quota key and the card belong to the same person.
3. **The paid offer exists** (Phase C): `share-130` (T4 PR2/PR3), `share-120` (<a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>), `share-110` (T2 Ph4+5).
4. **It bills** (Phase D): `subscribe-100/110/120`. **Met (2026-11-10):** billing and the private-model slot quota are live under the decided paywall (§4.9).
5. **The free tier monetises and acquires** (Phase D): T7 ads (`subscribe-130`) — parked (2026-11-10), not part of the bar.
6. **It's measurable and findable** (Phase G): `grow-120` events and GA hygiene, `grow-100` `/viewer/ifc` + `/viewer/step`, `community-110` feedback.

Demoted out of the MVP band (not load-bearing for the trickle): `open-200`, `share-200`, `grow-200`, and the Assist/AI arc. Rationale: organic traffic is near zero and the one earned channel, shared links, is uninvested, so launching Pro into an unmeasured funnel wastes the launch.

### Phase G (parallel, starts now): Growth funnel + SEO surfaces
**Goal:** the funnel is measurable, share links unfurl, and search intent has a landing page.
- Remaining `grow-120`: recipient share-loop attribution, size/complexity segmentation, GA4/Ads configuration and verification.
- `grow-100`: `/viewer/ifc` and `/viewer/step` first, then other formats.
- `grow-200`: OG metadata and recipient affordance; image generation may pair with Phase C.
- `grow-400`: the positioning page.

**Exit:** clean stage-by-stage funnel counts (large-model users visible as a segment); a shared link unfurls with a thumbnail; format and positioning pages indexed.

### Phase A: Stabilise the rebuilt viewer
**Goal:** launch can't ship if the viewer regresses on real models.
- T1 public-launch gate (screenshot harness + GLB diff in CI); `IfcViewsManager` deletion.
- Flag-flip decisions: `batchedMesh` always-on, `?feature=look` default-on.
- <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a> (critical: element-permalink hydration on private models); STEP verification <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a>.
- The engine worker, render on demand and motion residency are on by default (as of 2026-11-10); on-demand rendering is shipped (<a href="https://github.com/bldrs-ai/Share/pull/2104" target="_blank" rel="noopener noreferrer">#2104</a>; as of 2026-11-10); <a href="https://github.com/bldrs-ai/Share/issues/1561" target="_blank" rel="noopener noreferrer">#1561</a> and <a href="https://github.com/bldrs-ai/Share/issues/1545" target="_blank" rel="noopener noreferrer">#1545</a> are closed.

**Exit:** screenshot harness green on the fixture corpus; flag-flip decisions made (shipped or explicitly deferred).

### Phase B: Identity + Sources, multi-account
**Goal:** the Pro user has a coherent multi-account identity that quota tracking hangs off.
- T3 PR2 (SourcesTab, recents migration; connect actions gated behind Auth0) and PR3 (switchover, retire `githubAsSource`).
- `identity-120` (<a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a>); `identity-300` picker and "Saving as X" footer.

**Exit:** a user logged in via Google can browse and save to two GitHub accounts; recents are attributed per connection.

### Phase C: Sharing v1
**Goal:** in-app share with grants and visibility, parity Drive and GitHub.
- T4 PR2, PR3, PR5 behind `sharing`; `share-130` and `share-200` surfaces in the Share dialog.
- T2 Phase 4 (notes + view-states in the artifact) and Phase 5 (originator share flow), wired to `share-120`.
- `grow-200` OG image written with the share artifact, if that is the chosen mechanism; retire the `sharing` flag.

**Exit:** a user shares a model, invites a teammate, the teammate opens it in under 2 seconds, and the link unfurls with a thumbnail.

### Phase D: Subscribe
**Goal:** the Pro tier exists and bills under the decided paywall (free viewing with no login for local and public models; free account with 2 private models per rolling 7 days; Pro unlimited). **Met (as of 2026-11-10):** Stripe is live and slot quotas are default-on (private opens and private/local exports share the 2 slots; public exports need no slot; local viewing is unmetered). The v0.4 size/complexity axis was a proposal and was not adopted.
- Billing is documented in `design/new/quotas.md`, `design/new/glb-export-premium.md` and `design/new/netlify-functions-testing.md`; no separate billing doc is planned.
- Remaining: Pro upsell in the Share dialog (`share-120`, <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>).

**Exit:** a free user hits the paywall and can upgrade in two clicks (met); the funnel answers the conversion question.

### Phase E: Public-launch checklist
**Goal:** the public site is ready for cold traffic.
- T5 recents HEAD-check (<a href="https://github.com/bldrs-ai/Share/issues/1548" target="_blank" rel="noopener noreferrer">#1548</a> closed as of 2026-11-10).
- `community-110` thumbs widget; Sentry and GA dashboards and a failure-mode runbook; a week of real funnel data reviewed.
- Pricing page, ToS, Privacy updated; decide whether to drop the legacy Auth0-federated GitHub path.
- Outreach readiness: the Show HN moment (bizdev) waits for this phase.

**Exit:** MVP launch announcement.

## 7. The AI-workspace pivot

**Status:** direction agreed (2026-07). The design doc has landed: `design/new/ai-workspace.md` (PR <a href="https://github.com/bldrs-ai/Share/pull/1926" target="_blank" rel="noopener noreferrer">#1926</a> closed; as of 2026-11-10). This section is the roadmap-level summary.

### 7.1 Vision

Share becomes an **AI-native workspace for built-environment models** — the Claude-Code experience over a CAD/BIM project instead of a repo. The user talks to an agent that can see and operate the viewer, collaborates with teammates in the same conversation, and accumulates reusable AI-built tools. Everything shipped so far is the substrate: Conway-direct structured access, Notes, the AppsDrawer, identity/sharing, and the metering rails.

**Strategic frame:** the engine is the moat because it is the substrate an AI loop on real models requires: a large real-world model held client-side, fast, with a full structured IFC/STEP API.
- Headline: **"AI iterates on models nobody else can even open"**, not "fastest browser engine".
- What compounds: the semantic API as the agent-binding layer (MCP, T11), no-upload data sovereignty, the toolbelt flywheel.
- Success metric: **a handful of large-model, enterprise-profile users doing AI-on-a-model they can do nowhere else, and paying**, outweighs any amount of free small-model traffic.

### 7.2 Architecture: three surfaces

1. **Left drawer: workspace nav** (`assist-300`) — projects and company-level nav; UI/routing only.
2. **Conversational panel** (`assist-310`, `assist-400`) — direct replies to the AI are commands; general channel talk is human-to-human, the AI comment-only.
3. **Right drawer: AI-apps toolbelt** (`assist-320`) — agent-generated apps saved, versioned and run in a sandbox over an MCP bridge.

One contract: the viewer is an MCP server (T11) consumed by the agent and the sandboxed apps.

This arc stays post-MVP (per the owner, 2026-11-10); `design/new/conversational-cad.md` §5.1 now gathers the open permissions questions.

Constraints:
- **Data sovereignty is load-bearing.** Model bytes stay client-side; only conversation and tool results cross the wire, and that boundary should be explicit and user-visible. A broker that proxies model content wholesale would forfeit the story.
- **Read first, edit as the north star.** AI.2 ships the read/annotate loop; editing (AI.5) is the headline but must not outrun its substrate (T12).

### 7.3 What it absorbs

- `search-310` Knowledge graph: the retrieval layer behind conversational QA.
- `apps-300` Public API: MCP-first, one contract for external and internal consumers.
- `apps-310` Bldrs Integrate: agent-run model checks as toolbelt apps.
- `notes-*` / channels: one coherent story needed (§10).

### 7.4 Sequencing

The pivot **follows the MVP**: Phases B–D give it identity, sharing and the metering rails; metered agent usage is the natural Pro anchor. Foundations that can't destabilise launch may start earlier behind flags.

- **AI.0 — Design doc + seed repair.** Done: design doc landed (as of 2026-11-10). Seed repair remaining: fix <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> and re-enable the iframe suite.
- **AI.1 — Workspace shell.** `assist-300` (<a href="https://github.com/bldrs-ai/Share/issues/1657" target="_blank" rel="noopener noreferrer">#1657</a>), `?feature=workspace`; no AI dependency, can overlap MVP phases. Shipped behind the flag (drawer, top bar, relocations); layout direction revised 2026-11-10: sessions on the left, models as tabs (§4.11).
- **AI.1a — Fluid Nav + scoped search.** `search-320` (<a href="https://github.com/bldrs-ai/Share/issues/1658" target="_blank" rel="noopener noreferrer">#1658</a>); standalone viewer value if AI.2 slips. Not started.
- **AI.2 — Agent v0, single-user.** `assist-310` (<a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a>): MCP tool surface (T11) + agent loop (T10) + panel. The demo that sells the pivot, and it must run on a large model; refresh `grow-400` with it. Status: tool registry v0 and a prototype bot exist behind flags; the agent loop is the next build step, and the bot port must move onto the engine worker's async read surface.
- **AI.3 — Toolbelt.** `assist-320`: generate, save, version, run over the same MCP surface.
- **AI.4 — Multi-user.** `assist-400` (<a href="https://github.com/bldrs-ai/Share/issues/1660" target="_blank" rel="noopener noreferrer">#1660</a>): shared channels, presence; the largest new backend piece.
- **AI.5 — Editing loop (north star).** Agent-driven modification through the same contract on the T12 op log (`create-300`..`create-320`, <a href="https://github.com/bldrs-ai/Share/issues/1914" target="_blank" rel="noopener noreferrer">#1914</a>); only IFC/STEP export of an edited model still needs a Conway writer.

AI.2 is the earliest point at which the pivot is publicly visible.

### 7.5 What proves it

The benchmark proves the engine, not the business. Validation target: **large-model, enterprise-profile users running the AI loop on models they can't use anywhere else — paying**. Watch: `grow-120` size buckets (do large models show up?), conversion of users who hit the paywall, and design-partner outreach (bizdev-owned). A few such users outweigh any aggregate traffic number.

## 8. Post-MVP backlog (loveable)

Held over for after Phase E; items marked **→ §7** ride the pivot instead. Roughly in order of product pull:

1. `view-300` ETL / Table view 🔮 (❤️ Markus).
2. `open-210` Multi-IFC overlay (<a href="https://github.com/bldrs-ai/Share/issues/1251" target="_blank" rel="noopener noreferrer">#1251</a>).
3. `view-200` Persistent visibility URL encoding (<a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a>).
4. `view-210` Selection camera + measurement (<a href="https://github.com/bldrs-ai/Share/issues/1044" target="_blank" rel="noopener noreferrer">#1044</a>, <a href="https://github.com/bldrs-ai/Share/issues/1047" target="_blank" rel="noopener noreferrer">#1047</a>).
5. T2 Phase 6 shared cache tier.
6. T4 PR4 folder-scoped routes.
7. `notes-200` BCF round-trip.
8. T6 portable notes/versions for Drive.
9. `view-220` Common view ops; IDS separately.
10. `view-230` maps-style filtering UI on Placemarks 🔮.
11. `search-300` Cross-repo search 🔮 (❤️ Oleg); reassess after AI.2.
12. `apps-310` Bldrs Integrate → §7.
13. `apps-300` Public API + IDE 🔮 → §7.
14. `search-310` Knowledge graph 🔮 (❤️ Johannes) → §7.
15. `versions-300` Diff between versions.
16. PDF "Smart Components & Templates" 🔮 (❤️ Pablo); will warrant its own Epic group.
17. PDF "Hangouts" (Miro, FPV, WebXR); out of scope until demand.
18. PDF "Social Updates" (ActivityPub); no current pull.
19. `assist-410` Social broadcast plugins; placeholder from `conversational-cad.md` §5.

## 9. Issues and wiki

Standing convention (the original migration is done):
- One `epic`-labeled issue per Epic, titled `epic: <id>: <name>`, with native sub-issues per story sharing the epic's name (`CLAUDE.md`).
- Bizdev planning rows link to the implementing Share epics ("Implemented by"); epics carry a back-link comment.
- The wiki page `Planning:-Requirements` mirrors this doc as a public-facing summary (no implementation links or MVP-impact rows).

## 10. Open questions

- **Free-tier numbers.** Public anonymous share TTL, public hosting size ceiling (<10MB per <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>), refresh-token-mint rate.
- **Auth0 enforcement on Netlify Functions** (`identity-decoupling-decisions.md` §Open Implementation Details): flagged as a prerequisite for quota tracking, which has since shipped; confirm.
- **BCF priority.** Industry credibility vs cost; MVP scope or §8 item 7.
- **Engine write path.** IFC/STEP export of edited models needs a Conway writer; scope in `create-engine.md` Part B.
- **Conversation store** for `assist-400` (GitHub-issue-backed, Firestore, purpose-built) and whether channels and Notes are one primitive.
- **Sessions.** What a session is, and what a conversation is keyed to (`design/new/conversational-cad.md` §2.9, `ai-workspace.md` §15).
- **Unit of "private"** under sessions and projects (`conversational-cad.md` §5.1).
- **Sandbox security model** for toolbelt apps: origin isolation, tool permissioning, provenance (T11).
- **AI naming.** "Assist" is the working verb; the user-facing name is unpicked.
- **OG image mechanism.** Edge injection on `/share/*` vs pre-render at share time; decides whether `grow-200` finishes in Phase G or Phase C.
- **Design partners.** Do the named people markers (❤️ Markus, Oleg, Johannes, Kate) from the 2021–22 requirements doc still apply now that the company is solo-run?

**Decided:** unplaced epics: <a href="https://github.com/bldrs-ai/Share/issues/1601" target="_blank" rel="noopener noreferrer">#1601</a> is a T1 sub-track and <a href="https://github.com/bldrs-ai/Share/issues/2048" target="_blank" rel="noopener noreferrer">#2048</a> attaches to `identity-300`. Paywall wording reconciled with the shipped rule (§4.9, Phase D); the size/complexity axis was not adopted. Agent runtime placement (2026-10): the loop runs client-side, a thin `ai-chat` relay holds the hosted key and meters credits, BYOK goes direct (`ai-workspace.md` D1, D2, D6). Edit-log location: an op log over the immutable source, Share-side (`model-edit.md`).

## 11. Doc maintenance

- **Epic ships:** update its row in §3.1 and block in §4; drop it from §6 phases.
- **Track slice lands:** update its status in §3.2 and §5.
- **New Epic:** add it under its verb group in the milestone band it is needed for (§2.1) at the next free ten, with a §3.1 row; don't renumber existing IDs.
- **Tier change** is a deliberate renumber: add it to the ID lineage table, and update §6.0 if it crosses the 100 band.
- **Don't delete done Epics:** they stay as one-liners.
- **Stay short:** implementation detail and per-PR notes go in the epic's issue or its `design/new/` doc, not here.
- **Privacy firewall:** this doc is public. Growth/traffic numbers (spend, CAC, geo, raw counts) and bizdev decision outcomes never land here; event names, stage definitions and qualitative conclusions are fine.

# Changelog

- **v0.3 (2026-07-02):** folded in implementation drift (adapter retired, GPU-instancing arc, STEP metadata, marketing SSG), the growth-strategy reconciliation (paid search was the only channel delivering real model opens, organic discovery near zero, shared links the best earned traffic; so funnel instrumentation, SEO surfaces and share-loop polish became Phase G, §4.10, T9), and the AI-workspace pivot (§4.11, T10–T11, §7).
- **v0.4 (2026-07-03):** reconciled with the AI-strategy synthesis (private): commodity/moat split, the size/complexity quota proposal (never shipped), data sovereignty as a first-class feature (`grow-400`), the headline "AI iterates on models nobody else can even open".
- **v0.5 (2026-07-03):** renumbered Epics so the hundreds digit encodes the tier (100s MVP, 200s MLP, 300s Pro, 400s Enterprise).
- **v0.6 (2026-07-03):** redefined tiers as business milestones (§2.1), moved billing and funnel measurement into the MVP band and the AI arc out, added the §6.0 checklist, renamed "Pro-MVP plan" to MVP plan.
- **v0.7 (2026-07-27):** folded in the Conversational-CAD plan: `search-320`, stage AI.1a, scope extensions on `assist-*`, the `assist-410` placeholder.
- **v0.8 (2026-10-05):** added the Create group (§4.12) and Track T12: `create-300`/`310`/`320` (<a href="https://github.com/bldrs-ai/Share/issues/1914" target="_blank" rel="noopener noreferrer">#1914</a>, <a href="https://github.com/bldrs-ai/Share/issues/1919" target="_blank" rel="noopener noreferrer">#1919</a>, <a href="https://github.com/bldrs-ai/Share/issues/1920" target="_blank" rel="noopener noreferrer">#1920</a>); the editing loop no longer waits on Conway except for export.
- **v0.9 (2026-10-20):** refreshed shipped status against code (T8, T9, `subscribe-100/110/120`, `grow-120` to 🟡) and added the bizdev relation section.
- **v0.10 (2026-10-29):** closed-PR refresh: local-file fallbacks, model-slot quotas and pricing alignment, load/engagement/subscription analytics, auth-tier correctness.
- **v0.11 (2026-11-10):** this trim (1,994 to about 570 lines): short status up front, compact catalogue, issue links instead of inline detail; stale facts corrected (on-demand rendering, closed issues, `ai-workspace.md` landed, bizdev#331/#334 decided); `open-205` row and an Issue column added. 2026-11-10 status pass: assistant, workspace, engine and billing statuses updated; paywall wording reconciled; ads parked; #1601 and #2048 placed; open-205 assigned to T1. Pre-trim v0.10 text (full epic bodies, closed-story lists, analytics notes): https://github.com/bldrs-ai/Share/blob/85d5930ee62499a4a3e93e3123ddc27389aa2511/design/roadmap.md

## ID lineage

Every epic that has ever been renumbered (all others have been stable since v0.2). Resolve any ID in an older branch, issue or PR through this table; several numbers were **reused across revisions** (`share-120`, `share-130`, `share-200`, `open-200`, `view-130`, `view-220`, `view-230`, `assist-300`), and `subscribe-100/110/120` were restored to their original meanings.

| Epic (current name) | v0.2–v0.4 | v0.5 | v0.6 (current) |
|---|---|---|---|
| Recents reliability | open-150 | open-130 | `open-200` |
| Open multiple IFCs in one session | open-140 | open-200 | `open-210` |
| Multi-account Sources tab | open-130 | open-300 | `open-300` |
| Persistent visibility / Isolate | view-130 | view-200 | `view-200` |
| Selection camera + measurement | view-140 | view-210 | `view-210` |
| Performance + large-model viewing | view-150 | view-130 | `view-130` |
| Common view operations | view-170 | view-230 | `view-220` |
| Placemarks + maps-style filtering | view-180 | view-240 | `view-230` |
| ETL / Table view | view-160 | view-220 | `view-300` |
| Extended Share/Login flow | share-150 | share-200 | `share-120` |
| Private link sharing | share-120 | share-300 | `share-130` |
| Grant/revoke per-principal | share-130 | share-310 | `share-200` |
| Folder-scoped boundaries | share-140 | share-400 | `share-400` |
| BCF round-trip | notes-110 | notes-200 | `notes-200` |
| Drive-backed notes | notes-120 | notes-210 | `notes-300` |
| Diff between versions | versions-110 | versions-200 | `versions-300` |
| Portable versions for Drive | versions-120 | versions-210 | `versions-310` |
| Cross-repo search | search-110 | search-200 | `search-300` |
| Knowledge graph | search-120 | search-210 | `search-310` |
| Profile drawer + multi-account picker | identity-130 | identity-300 | `identity-300` |
| v1.0 Public API + IDE | apps-130 | apps-200 | `apps-300` |
| Bldrs Integrate | apps-120 | apps-210 | `apps-310` |
| Bug report w/ screenshot | community-120 | community-200 | `community-200` |
| AEC outreach | community-130 | community-210 | `community-210` |
| Pricing tiers + feature manager | subscribe-100 | subscribe-300 | `subscribe-100` |
| Stripe checkout + portal | subscribe-110 | subscribe-310 | `subscribe-110` |
| Quota tracking | subscribe-120 | subscribe-320 | `subscribe-120` |
| Rich share-link previews (OG) | grow-110 (v0.3) | grow-110 | `grow-200` |
| Large-model + sovereignty positioning | grow-130 (v0.4) | grow-400 | `grow-400` |
| Workspace shell (left drawer) | assist-100 (v0.3) | assist-100 | `assist-300` |
| Conversational agent panel | assist-110 (v0.3) | assist-110 | `assist-310` |
| AI-apps toolbelt | assist-130 (v0.3) | assist-200 | `assist-320` |
| Multi-user channels + AI modes | assist-120 (v0.3) | assist-300 | `assist-400` |
