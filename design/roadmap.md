# Bldrs Share Roadmap

**Status:** Draft v0.22 — every epic and track has an issue; §4 and §5 retired, status per verb group in §3.1
**Date:** 2026-11-23
**Owner:** Pablo
**Source baseline:** `Share Requirements` Google Doc (Aug 2021, last updated Nov 2022); PDF extract is in this repo's history.

This doc owns the epic list, IDs, tiers and phases (§3.1), the Tracks (§3.2), the MVP plan (§6) and the AI pivot (§7). An epic's scope, stories, decisions and status live in its own `epic`-labeled GitHub issue (§3.1's Issue column), which is the source of truth for the epic; a track's live in its tracking issue (§3.2). §4 and §5, which described them, are retired. The wiki page `Planning:-Requirements` mirrors this doc as a public summary; when it disagrees, this doc wins and the wiki gets updated.

## 1. Approach

- **Epic** = verb-shaped product capability the user experiences (Open, View, Share, …); one `epic`-labeled issue each.
- **Story** = scoped user-visible feature with E2E (Playwright) coverage as the acceptance gate; one `story`-labeled issue each.
- **Track** = orthogonal subsystem rebuild that unblocks several Epics; each has a design doc in `design/new/`.

§3 is the overview (one table per verb group and one for the Tracks, each linking its issues), §4 and §5 are retired notes, §6 the MVP plan, §7 the AI-workspace pivot, §8 the post-MVP backlog.

## 2. Status legend

| Symbol | Meaning |
|---|---|
| ✔ | Done in production. Default-on. E2E covered (or follow-up E2E captured). |
| 🟡 | In flight — PR open, design doc landed, or substantial code written behind a flag. |
| ⬜ | Backlog — defined enough to start, not started. |
| 🔮 | Loveable / post-MVP — held over from PDF's 🥇/❤️ markers or new. |
| 🔒 | Pro gated — free users can see it exists but can't use the full capability. |

From the PDF: 🥉 = MVP, 🥇 = MLP (Minimum Loveable Product), ❤️ = personal MLP (a named person; the named people are former teammates, and the markers are kept as the record of their requests). Those markers are kept in §4. Work added since the PDF is marked `(NEW)`.

### 2.1 Tier rubric (Epic ID numbering)

The hundreds digit of an Epic ID encodes the **business milestone the epic is needed for**, not feature-fanciness: the earliest milestone below that doesn't happen without it. Sub-steps (110, 120, …) order epics within a band.

| Range | Milestone | The bar (qualitative; measured via `grow-120` events — numbers live bizdev-side) |
|---|---|---|
| 100–199 | **MVP** | An initial **trickle of paying customers** — not just the first — arriving steadily, with **CAC estimable** from the Ads funnel (spend ÷ paid conversions) and a steady trickle of signups. |
| 200–299 | **MLP** | Significant strides on that trickle by **building out the basics** — signup/paid growth accelerating at a respectable rate. |
| 300–399 | **Pro** | Confidence stage: **power features** shipping and earning **positive feedback at the feature level**. |
| 400–499 | **Enterprise** | A fully up-and-running business: validated **ideal customer personas**, breadth of positive feedback, org-scale packaging (sovereignty posture, admin, boundaries). |

## 3. Status overview

One row per Epic and Track. Each verb group has its purpose and status above its table; an epic's description is in its issue and a Track's in its tracking issue. **Phase column:** A–E = MVP-plan phases (§6: A stabilise viewer, B identity, C sharing, D subscribe, E launch checklist); G = growth funnel (§6, parallel); AI = pivot arc (§7); — = shipped or not placed; Post = §8 backlog.

### 3.1 Epics

One table per verb group. Each group has its purpose and its status, so there is one status per group; an epic's own status, scope and stories are in its issue (the Issue column).

#### Open

User can open a model from local, cloud, or shared link, with format breadth and multi-model composition.

**Status:** The 100-band epics (local, GitHub, Drive) are shipped, and Recents (`open-130`) is polish for Phase E. **Workspace shell:** projects drawer, TopBar and Profile/Share relocation are shipped behind `?feature=workspace` (`open-200`, renumbered from `assist-300` on 2026-11-18). Layout decided 2026-11-10 and refined 2026-11-18: the left nav lists each project's models and sessions, and a session's models open as tabs (`design/reqs/workspace.md`). **In flight:** the remaining half of in-app model switching (`open-205` Phase 1b: session-owned workers, close and eviction; the switch itself is on by default). Viewing several models together (`open-210`) is post-MVP.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Open | `open-100` | Open a local file or sample model | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2258" target="_blank" rel="noopener noreferrer">#2258</a> |
| Open | `open-110` | Open a model from GitHub | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2259" target="_blank" rel="noopener noreferrer">#2259</a> |
| Open | `open-120` | Open a model from Google Drive | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2260" target="_blank" rel="noopener noreferrer">#2260</a> |
| Open | `open-130` | Recents that tell you when a model is gone | 🟡 | E | `open-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2261" target="_blank" rel="noopener noreferrer">#2261</a> |
| Open | `open-200` | Workspace: projects, their models and sessions | 🟡 | AI | — | <a href="https://github.com/bldrs-ai/Share/issues/1657" target="_blank" rel="noopener noreferrer">#1657</a> |
| Open | `open-205` | In-app model switching | 🟡 | AI | `view-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2011" target="_blank" rel="noopener noreferrer">#2011</a> |
| Open | `open-210` | View several models together | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/2192" target="_blank" rel="noopener noreferrer">#2192</a> |
| Open | `open-300` | Open from any account I've connected | 🟡 | B | `identity-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2262" target="_blank" rel="noopener noreferrer">#2262</a> |

#### View

User can inspect the model in 3D with the navigation, properties, search-by-element, slice, and isolation controls expected of a BIM viewer.

**Status:** **Viewer and engine:** rebuilt on Conway-direct with the GLB cache (`view-t100`/`share-t101`), default-on. The per-model engine worker, render on demand and motion residency are on by default (kill switches `disableEngineWorker`, `disableRenderOnDemand`, `disableMotionResidency`), and hover is drawn on a held frame. Per the owner (2026-11-10), this was tested extensively and gives a mostly smooth frame rate on a ~900 MB IFC, with interactivity during load. **Remaining:** the public-launch gate (`view-130`, required for MVP, §6.0 item 1). `view-100` to `view-120` are shipped; `view-200` onward are post-MVP (§8).

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| View | `view-100` | 3D + NavTree + Properties | ✔ | — | `view-t100`, `share-t101` | <a href="https://github.com/bldrs-ai/Share/issues/2270" target="_blank" rel="noopener noreferrer">#2270</a> |
| View | `view-110` | Cut planes | ✔ | — | `view-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2271" target="_blank" rel="noopener noreferrer">#2271</a> |
| View | `view-120` | Shareable camera position | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2272" target="_blank" rel="noopener noreferrer">#2272</a> |
| View | `view-130` | Performance + large-model viewing | 🟡 | A | `view-t100`, `share-t101` | <a href="https://github.com/bldrs-ai/Share/issues/2273" target="_blank" rel="noopener noreferrer">#2273</a> |
| View | `view-140` | Scoped display controls + shareable display state | 🟡 | C | `view-t100`, `share-t101` | <a href="https://github.com/bldrs-ai/Share/issues/1705" target="_blank" rel="noopener noreferrer">#1705</a> |
| View | `view-200` | Persistent visibility / Isolate | 🟡 | Post | `view-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2274" target="_blank" rel="noopener noreferrer">#2274</a> |
| View | `view-210` | Selection-based camera + measurement | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/2275" target="_blank" rel="noopener noreferrer">#2275</a> |
| View | `view-220` | Common view ops (nav-cube, explode, undo, IDS) | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/1881" target="_blank" rel="noopener noreferrer">#1881</a> |
| View | `view-230` | Placemarks + maps-style issues w/filtering (🥇) | 🟡 | C, Post | `view-t100`, `notes-t200` | <a href="https://github.com/bldrs-ai/Share/issues/2276" target="_blank" rel="noopener noreferrer">#2276</a> |
| View | `view-300` | ETL / Table view (❤️ Markus) | 🔮 | Post | `view-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2277" target="_blank" rel="noopener noreferrer">#2277</a> |

#### Share

User shares a model, a view, a note, or a region with another user — privately or publicly — and the recipient sees what was intended.

**Status:** **GLB export** (`share-140`): entitled to Pro; free users export public models freely and private/local models through the same slots (`design/new/glb-export-premium.md`). **Model versioning and sharing** (`share-200`, <a href="https://github.com/bldrs-ai/Share/issues/2144" target="_blank" rel="noopener noreferrer">#2144</a>, [design](new/model-versioning.md)): design planned; whole-file history and public pinned-version links first, semantic editing later; implementation not started. Its link-resolver slice is MVP (Phase C). Per-principal grants are `share-201`. **In flight:** private sharing (`share-t100`).

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Share | `share-100` | Share link to current view | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2284" target="_blank" rel="noopener noreferrer">#2284</a> |
| Share | `share-110` | Save a model to Google Drive | ⬜ | C | — | <a href="https://github.com/bldrs-ai/Share/issues/2205" target="_blank" rel="noopener noreferrer">#2205</a> |
| Share | `share-120` | Extended Share/Login flow | 🟡 | C, D | — | <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a> |
| Share | `share-130` | Private-by-default links + visibility chip | ⬜ | C | `share-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2206" target="_blank" rel="noopener noreferrer">#2206</a> |
| Share | `share-140` | GLB export with Pro entitlement and free model slots | 🟡 | D | `share-t101`, `subscribe-t100` | <a href="https://github.com/bldrs-ai/Share/issues/1831" target="_blank" rel="noopener noreferrer">#1831</a> |
| Share | `share-200` | Model versioning and sharing: git + progressive decomposition | 🟡 | C (link resolver), Post, AI | `share-t101`, `create-t300` (V1+) | <a href="https://github.com/bldrs-ai/Share/issues/2144" target="_blank" rel="noopener noreferrer">#2144</a> |
| Share | `share-201` | Share with named people (grants) | ⬜ | Post | `share-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2207" target="_blank" rel="noopener noreferrer">#2207</a> |
| Share | `share-400` | Folder-scoped boundaries | ⬜ | Post | `share-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2208" target="_blank" rel="noopener noreferrer">#2208</a> |

#### Notes & Versions

User leaves comments anchored to model elements, replies in a thread, and can revisit a specific version of the model.

**Status:** `notes-100` is shipped with a set of open follow-up stories (<a href="https://github.com/bldrs-ai/Share/issues/670" target="_blank" rel="noopener noreferrer">#670</a>); `versions-100` reuses the tracker <a href="https://github.com/bldrs-ai/Share/issues/57" target="_blank" rel="noopener noreferrer">#57</a>. Whether the open stories count toward MVP is a milestone hypothesis still to be measured (`design/reqs/ux-rubric.md`), so §6.0 is unchanged. BCF, Drive-backed notes, version diff and portable versions are post-MVP.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Notes | `notes-100` | Anchored notes (GitHub-backed) | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/670" target="_blank" rel="noopener noreferrer">#670</a> |
| Notes | `notes-200` | BCF round-trip | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/2280" target="_blank" rel="noopener noreferrer">#2280</a> |
| Notes | `notes-300` | Drive-backed notes (NotesProvider) | 🔮 | Post | `notes-t200` | <a href="https://github.com/bldrs-ai/Share/issues/2281" target="_blank" rel="noopener noreferrer">#2281</a> |
| Versions | `versions-100` | Exact revisions, history and local retention | 🟡 | — | — | <a href="https://github.com/bldrs-ai/Share/issues/57" target="_blank" rel="noopener noreferrer">#57</a> |
| Versions | `versions-300` | Diff between versions | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/2282" target="_blank" rel="noopener noreferrer">#2282</a> |
| Versions | `versions-310` | Portable versions for Drive | 🔮 | Post | `notes-t200` | <a href="https://github.com/bldrs-ai/Share/issues/2283" target="_blank" rel="noopener noreferrer">#2283</a> |

#### Search

User finds elements in the current model, across their repos, or across the building data graph.

**Status:** `search-100` is 🟡: permalinks are done, and search by element name folds into `search-320` (not started; stage AI.1a, §7.4). `search-310` (knowledge graph) is absorbed by the assistant. `search-300` is post-MVP.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Search | `search-100` | Search current model | 🟡 | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2278" target="_blank" rel="noopener noreferrer">#2278</a> |
| Search | `search-300` | Search across GitHub repos (❤️ Oleg) | 🔮 | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/2279" target="_blank" rel="noopener noreferrer">#2279</a> |
| Search | `search-310` | Knowledge graph (🥇, ❤️ Johannes) | 🔮 | AI | `assist-t300` | <a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a> (absorbed) |
| Search | `search-320` | Fluid NavTree + breadcrumb-scoped search (NEW) | ⬜ | AI | — | <a href="https://github.com/bldrs-ai/Share/issues/1658" target="_blank" rel="noopener noreferrer">#1658</a> |

#### Identity & Account

User signs in, links data sources, and the system honors that even across primary-auth changes.

**Status:** **In flight:** identity/multi-account (`identity-t100`). PR1 and PR2 are merged behind `githubAsSource` (off); PR3, the switchover, is post-MVP (decided 2026-11-18), and GitHub through the Auth0 sign-in keeps working meanwhile. **Required for MVP** (Phase B): `identity-120` and `identity-300`.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Identity | `identity-100` | Auth0 primary login | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2285" target="_blank" rel="noopener noreferrer">#2285</a> |
| Identity | `identity-110` | GitHub as Sources peer | 🟡 | B | `identity-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2286" target="_blank" rel="noopener noreferrer">#2286</a> |
| Identity | `identity-120` | Auth disambiguation | 🟡 | B | — | <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a> |
| Identity | `identity-300` | Profile drawer + multi-account picker | 🟡 | B | `identity-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2287" target="_blank" rel="noopener noreferrer">#2287</a> (consent: <a href="https://github.com/bldrs-ai/Share/issues/2048" target="_blank" rel="noopener noreferrer">#2048</a>) |

#### Apps

Third-party (and dogfooded) apps add capabilities to Share via a stable API.

**Status:** `apps-100` and `apps-110` are shipped. `apps-300` and `apps-310` are re-scoped by the AI pivot (MCP-first, shared with the in-app agent). The broken iframe integration (<a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a>) is the pivot's blocker (§7.4 AI.0).

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Apps | `apps-100` | Browse + select app (AppsDrawer) | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2288" target="_blank" rel="noopener noreferrer">#2288</a> |
| Apps | `apps-110` | XYZ demo app (v0.1 API dogfood) | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2289" target="_blank" rel="noopener noreferrer">#2289</a> |
| Apps | `apps-300` | v1.0 Public API + IDE (🥇) | 🔮 | AI | `apps-t300` | <a href="https://github.com/bldrs-ai/Share/issues/2290" target="_blank" rel="noopener noreferrer">#2290</a> |
| Apps | `apps-310` | Bldrs Integrate (CI + ArchiCAD/Speckle) | 🔮 | AI | `apps-t300` | <a href="https://github.com/bldrs-ai/Share/issues/2291" target="_blank" rel="noopener noreferrer">#2291</a> |

#### Community & Onboarding

User finds out about Bldrs, gets oriented, leaves feedback, and finds product help.

**Status:** `community-100` is shipped. For `community-110`, analytics shipped; the 👍/👎 exit widget and survey link remain, and one feedback affordance is needed for public launch (Phase E). `community-200` is post-MVP unless support burden demands it earlier. `community-210` (AEC outreach) is out of repository scope, owned by the bizdev growth-strategy doc; Phase G instrumentation lands first.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Community | `community-100` | Welcome dialog + onboarding | ✔ | — | — | <a href="https://github.com/bldrs-ai/Share/issues/2293" target="_blank" rel="noopener noreferrer">#2293</a> |
| Community | `community-110` | Analytics + survey + thumbs feedback | 🟡 | E | — | <a href="https://github.com/bldrs-ai/Share/issues/2294" target="_blank" rel="noopener noreferrer">#2294</a> |
| Community | `community-200` | Bug report w/ screenshot + session state | ⬜ | Post | — | <a href="https://github.com/bldrs-ai/Share/issues/2295" target="_blank" rel="noopener noreferrer">#2295</a> |
| Community | `community-210` | AEC outreach (🥇) | 🔮 | Post | — | → bizdev (no Share issue) |

#### Subscribe

User upgrades from free to Pro, the system tracks quota, and Pro-only features become available. Origin: the Pro mock in <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>; nothing in the PDF.

**Status:** **Billing and quotas are live.** Stripe (hosted pricing table, portal, webhook, daily reconcile) and the decided paywall: free viewing with no login for local and public models; a free account gets 2 private models per rolling 7 days (open, share and export on those); Pro has unlimited private models and exports. The v0.4 size/complexity axis (quota by model size) was a proposal and was not adopted. Decision: <a href="https://github.com/bldrs-ai/bizdev/issues/331" target="_blank" rel="noopener noreferrer">bizdev#331</a>. Rules: `design/new/quotas.md`, and the pricing page. `subscribe-100`, `-110` and `-120` are done. **Ads** (`subscribe-130`, `subscribe-t101`): off and parked (per the owner, 2026-11-10); AdSense stays off for a while, possibly permanently.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Subscribe | `subscribe-100` | Pricing tiers + feature manager (NEW) | ✔ | D | `subscribe-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2296" target="_blank" rel="noopener noreferrer">#2296</a> |
| Subscribe | `subscribe-110` | Stripe checkout + portal (NEW) | ✔ | D | `subscribe-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2297" target="_blank" rel="noopener noreferrer">#2297</a> |
| Subscribe | `subscribe-120` | Quota tracking (NEW) | ✔ | D | `subscribe-t100`, `identity-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2298" target="_blank" rel="noopener noreferrer">#2298</a> |
| Subscribe | `subscribe-130` | Ads on free tier | 🔮 | D | `subscribe-t101` | <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a> |
| Subscribe | `subscribe-400` | Enterprise tier definition (NEW) | ⬜ | Post | `subscribe-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2299" target="_blank" rel="noopener noreferrer">#2299</a> |

#### Grow

Moved to the private bizdev repo on 2026-11-18.

**Status:** The epics, their status and their stories live in the private bizdev repo (`docs/growth-roadmap.md`, <a href="https://github.com/bldrs-ai/bizdev/issues/369" target="_blank" rel="noopener noreferrer">bizdev#369</a>–<a href="https://github.com/bldrs-ai/bizdev/issues/372" target="_blank" rel="noopener noreferrer">bizdev#372</a>); the codes are unchanged, and code work for a growth story gets a Share story linking back. `grow-100` is parked until it is measured (<a href="https://github.com/bldrs-ai/bizdev/issues/368" target="_blank" rel="noopener noreferrer">bizdev#368</a>). Implementation design stays here in Share (funnel events: `design/new/quotas.md` §"Funnel analytics").

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Grow | `grow-100` | SEO format landing pages `/viewer/*` (NEW) | → bizdev | G | T9 | <a href="https://github.com/bldrs-ai/bizdev/issues/369" target="_blank" rel="noopener noreferrer">bizdev#369</a> |
| Grow | `grow-120` | Funnel instrumentation + GA hygiene (NEW) | → bizdev | G | T9 | <a href="https://github.com/bldrs-ai/bizdev/issues/370" target="_blank" rel="noopener noreferrer">bizdev#370</a> |
| Grow | `grow-200` | Rich share-link previews / OG cards (NEW) | → bizdev | G | T9 | <a href="https://github.com/bldrs-ai/bizdev/issues/371" target="_blank" rel="noopener noreferrer">bizdev#371</a> |
| Grow | `grow-400` | Large-model + data-sovereignty positioning (NEW) | → bizdev | G | T9 | <a href="https://github.com/bldrs-ai/bizdev/issues/372" target="_blank" rel="noopener noreferrer">bizdev#372</a> |

#### Assist

User works with an AI agent on their models, collaborates with teammates in the same conversation, and accumulates AI-built tools. Epic-level decomposition of §7. Design: `design/new/ai-workspace.md`; epic plan: `design/new/conversational-cad.md`.

**Status:** Design doc landed. The viewer tool registry v0 and the agent loop over it are on main behind `?feature=assist`, with a hosted relay and credit ledger (<a href="https://github.com/bldrs-ai/Share/issues/2199" target="_blank" rel="noopener noreferrer">#2199</a>, <a href="https://github.com/bldrs-ai/Share/issues/2220" target="_blank" rel="noopener noreferrer">#2220</a>); no tray or sessions yet. The arc stays post-MVP (§7).

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Assist | `assist-310` | Conversational agent panel, single-user (NEW) | 🟡 | AI | `assist-t300`, `apps-t300` | <a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a> |
| Assist | `assist-320` | AI-apps toolbelt: save/version/run + MCP (NEW) | ⬜ | AI | `apps-t300` | <a href="https://github.com/bldrs-ai/Share/issues/2292" target="_blank" rel="noopener noreferrer">#2292</a> |
| Assist | `assist-400` | Multi-user channels + AI participation modes (NEW) | ⬜ | AI | `assist-t300` | <a href="https://github.com/bldrs-ai/Share/issues/1660" target="_blank" rel="noopener noreferrer">#1660</a> |

#### Create

User changes the model, not just the view of it, by hand or through the agent. Built as an op log over the immutable source (`create-t300`), so it does not wait for an engine write path. Plan: `design/new/model-edit.md`.

**Status:** **In flight:** the model-edit substrate (`create-300`). L0, the mutation-safe batches (<a href="https://github.com/bldrs-ai/Share/issues/1915" target="_blank" rel="noopener noreferrer">#1915</a>), is closed; the op log and undo/redo (<a href="https://github.com/bldrs-ai/Share/issues/1916" target="_blank" rel="noopener noreferrer">#1916</a>), apply backends and persistence remain. Behind `?feature=edit`.

| Verb | ID | Name | Status | Phase | Tracks | Issue |
|---|---|---|---|---|---|---|
| Create | `create-300` | Model edit substrate: CRUD over an op log (NEW) | 🟡 | AI | `create-t300` | <a href="https://github.com/bldrs-ai/Share/issues/1914" target="_blank" rel="noopener noreferrer">#1914</a> |
| Create | `create-310` | Agent write tools (NEW) | ⬜ | AI | `apps-t300`, `create-t300` | <a href="https://github.com/bldrs-ai/Share/issues/1919" target="_blank" rel="noopener noreferrer">#1919</a> |
| Create | `create-320` | Generative model creation: engine selection (NEW) | ⬜ | AI | `create-t300` | <a href="https://github.com/bldrs-ai/Share/issues/1920" target="_blank" rel="noopener noreferrer">#1920</a> |

### 3.2 Tracks

Each track has a tracking issue (the Issue column) that holds its status, its work items as sub-issues and its open decisions, and a long-form design doc. Tracks are named `<feature>-t<band><nn>` (provisional, 2026-11-18): the primary feature group and the band of the epics it mainly serves; the old `T<n>` numbers are in the ID lineage. T9 is bizdev's and keeps its number. How tracks are written down and tracked: [`design/dx/dx-rubric.md`](dx/dx-rubric.md). The Phase column also says how much of the MVP the track carries: *launch gate* means required; *polish* or *Post* means not load-bearing.

| ID | Name | Status | Phase | Issue | Docs | Unblocks |
|---|---|---|---|---|---|---|
| `view-t100` | Viewer Replacement | 🟡 | A (launch gate) | <a href="https://github.com/bldrs-ai/Share/issues/2300" target="_blank" rel="noopener noreferrer">#2300</a> | [viewer-replacement](new/viewer-replacement.md), [engine-worker](new/engine-worker.md) | `view-100`, `view-110`, `view-200`, `view-130`, `view-300`, `open-205`, `share-t101` |
| `share-t101` | GLB Model Sharing | 🟡 | Post (Ph 4–6) | <a href="https://github.com/bldrs-ai/Share/issues/2201" target="_blank" rel="noopener noreferrer">#2201</a> | [glb-model-sharing](new/glb-model-sharing.md), [glb-export-premium](new/glb-export-premium.md) | `share-140` cache, `share-200` derived GLB, `view-130` |
| `identity-t100` | Identity Decoupling | 🟡 | Post (PR3) | <a href="https://github.com/bldrs-ai/Share/issues/2202" target="_blank" rel="noopener noreferrer">#2202</a> | [identity-decoupling-decisions](new/identity-decoupling-decisions.md) | `identity-110`, `identity-300`, `open-300`, `subscribe-120`, `share-t100` PR3 |
| `share-t100` | Multi-User Sharing | 🟡 | C (chip), Post | <a href="https://github.com/bldrs-ai/Share/issues/2203" target="_blank" rel="noopener noreferrer">#2203</a> | [multi-user-sharing](new/multi-user-sharing.md) | `share-130`, `share-201`, `share-400` |
| `open-t100` | Drive Recents HEAD-check | ⬜ | E (polish) | <a href="https://github.com/bldrs-ai/Share/issues/2301" target="_blank" rel="noopener noreferrer">#2301</a> | [drive-recents-head-check](new/drive-recents-head-check.md) | `open-130` |
| `notes-t200` | Notes & Versions sidecar formats | ⬜ | Post | <a href="https://github.com/bldrs-ai/Share/issues/2204" target="_blank" rel="noopener noreferrer">#2204</a> | [model-versioning](new/model-versioning.md) | `notes-200`, `notes-300`, `versions-310` |
| `subscribe-t101` | Ads | 🔮 | D | <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a> (epic) | [ads](new/ads.md) | `subscribe-130` |
| `subscribe-t100` | Pro/Billing (NEW) | 🟡 | D | <a href="https://github.com/bldrs-ai/Share/issues/2302" target="_blank" rel="noopener noreferrer">#2302</a> | [quotas](new/quotas.md), [glb-export-premium](new/glb-export-premium.md), [netlify-functions-testing](new/netlify-functions-testing.md) | `subscribe-100`, `subscribe-110`, `subscribe-120`, §7 AI metering |
| T9 | Growth funnel & SEO surfaces (NEW) | → bizdev | G | bizdev | — | `grow-100`, `grow-200`, `grow-120` |
| `assist-t300` | Agent runtime & conversation store (NEW) | 🟡 | AI (§7) | <a href="https://github.com/bldrs-ai/Share/issues/2303" target="_blank" rel="noopener noreferrer">#2303</a> | [ai-workspace](new/ai-workspace.md) | `assist-310`, `assist-400`, `search-310` |
| `apps-t300` | App sandbox + MCP bridge (NEW) | 🟡 | AI (§7) | <a href="https://github.com/bldrs-ai/Share/issues/2225" target="_blank" rel="noopener noreferrer">#2225</a> | [snapshot](dx/apps-t300.md), [ai-workspace](new/ai-workspace.md) | `assist-320`, `apps-300`, `apps-310` |
| `create-t300` | Model edit substrate (NEW) | 🟡 | AI (§7) | <a href="https://github.com/bldrs-ai/Share/issues/2304" target="_blank" rel="noopener noreferrer">#2304</a> | [model-edit](new/model-edit.md), [create-engine](new/create-engine.md) | `create-300`, `create-310`, `create-320`, `share-200` V1+, §7.4 AI.5 |

## 4. Epic catalogue (retired)

Retired 2026-11-23. Every epic now has its own `epic`-labeled issue (§3.1's Issue column; Grow's are in bizdev), so a second description here would only drift from it. An epic's scope, stories, decisions and status live in its issue, and the UX epics also have a dated snapshot and a triage record under [`design/reqs/`](reqs/README.md). The purpose and status of each verb group are in §3.1. The old descriptions are in the Git history at [`6704441`](https://github.com/bldrs-ai/Share/blob/6704441/design/roadmap.md).

## 5. Cross-cutting Tracks (retired)

Retired 2026-11-23. Each track's status, work items and open decisions are in its tracking issue (§3.2's Issue column), with its design doc linked beside it. The old track descriptions are in the Git history at [`6704441`](https://github.com/bldrs-ai/Share/blob/6704441/design/roadmap.md). How tracks are written down: [`design/dx/dx-rubric.md`](dx/dx-rubric.md).

## 6. MVP plan

Goal: ship the **paid tier** publicly. Free and Pro coexist; anonymous use stays possible; private sharing, multi-account and quota are paid. (Called the "Pro-MVP plan" before v0.6.) Phases A–B can overlap; C–E sequence; **Phase G runs in parallel, starting now.**

### 6.0 The MVP bar

MVP is a milestone, not a launch event: **a steady trickle of paying customers, arriving week after week without hand-holding, with CAC estimable as ad spend ÷ paid conversions from the `grow-120` funnel, on top of a steady trickle of signups.** One paying customer is an anecdote; the trickle is the evidence. Targets live in the private bizdev docs.

*2026-11-10 (per the owner):* the paid offer is live, and the working view is that the bar is met when users upgrade on their own as features improve, so the open question is which feature earns the first upgrades rather than further gating.

The open 100-band work, exhaustively — this list is the MVP:

1. **The viewer holds** (Phase A): `view-t100` public-launch gate, <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a>, STEP verification <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a>. (<a href="https://github.com/bldrs-ai/Share/issues/1561" target="_blank" rel="noopener noreferrer">#1561</a> and <a href="https://github.com/bldrs-ai/Share/issues/1545" target="_blank" rel="noopener noreferrer">#1545</a> closed; on-demand rendering shipped, as of 2026-11-10.)
2. **Identity is billable** (Phase B): <a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a> (`identity-120`), so the quota key and the card belong to the same person.
3. **The paid offer exists** (Phase C): `share-130` (`share-t100` chip, on `share-200`'s link-resolver slice), `share-120` (<a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>), `share-110` (Drive Save).
4. **It bills** (Phase D): `subscribe-100/110/120`. **Met (2026-11-10):** billing and the private-model slot quota are live under the decided paywall (§3.1, Subscribe).
5. **The free tier monetises and acquires** (Phase D): `subscribe-t101` ads (`subscribe-130`) — parked (2026-11-10), not part of the bar.
6. **It's measurable** (Phase G): `grow-120` events and GA hygiene, `community-110` feedback. The `grow-*` items are tracked in bizdev (§3.1).

Demoted out of the MVP band (not load-bearing for the trickle): `share-201`, `grow-200`, and the Assist/AI arc. `grow-100` is parked until it's measured (<a href="https://github.com/bldrs-ai/bizdev/issues/368" target="_blank" rel="noopener noreferrer">bizdev#368</a>). Rationale: organic traffic is near zero and the one earned channel, shared links, is uninvested, so launching Pro into an unmeasured funnel wastes the launch.

`open-130` (Recents) sits in the 100 band as a variation on `open-100`–`open-120`, though it isn't on this list; the bar is an estimate (owner, 2026-11-18).

### Phase G (parallel, starts now): Growth funnel + SEO surfaces
**Goal:** the funnel is measurable and share links unfurl. Format landing pages (`grow-100`) wait on that measurement.
- The work is the `grow-*` epics, tracked in bizdev (§3.1).

**Exit:** clean stage-by-stage funnel counts (large-model users visible as a segment); a shared link unfurls with a thumbnail; the positioning page indexed.

### Phase A: Stabilise the rebuilt viewer
**Goal:** launch can't ship if the viewer regresses on real models.
- `view-t100` public-launch gate (screenshot harness + GLB diff in CI); `IfcViewsManager` deletion.
- Flag-flip decisions: `batchedMesh` always-on, `?feature=look` default-on.
- <a href="https://github.com/bldrs-ai/Share/issues/1249" target="_blank" rel="noopener noreferrer">#1249</a> (critical: element-permalink hydration on private models); STEP verification <a href="https://github.com/bldrs-ai/Share/issues/1569" target="_blank" rel="noopener noreferrer">#1569</a>.
- The engine worker, render on demand and motion residency are on by default (as of 2026-11-10); on-demand rendering is shipped (<a href="https://github.com/bldrs-ai/Share/pull/2104" target="_blank" rel="noopener noreferrer">#2104</a>; as of 2026-11-10); <a href="https://github.com/bldrs-ai/Share/issues/1561" target="_blank" rel="noopener noreferrer">#1561</a> and <a href="https://github.com/bldrs-ai/Share/issues/1545" target="_blank" rel="noopener noreferrer">#1545</a> are closed.

**Exit:** screenshot harness green on the fixture corpus; flag-flip decisions made (shipped or explicitly deferred).

### Phase B: Identity + Sources, multi-account
**Goal:** the Pro user has a coherent multi-account identity that quota tracking hangs off.
- `identity-t100` PR2 merged (<a href="https://github.com/bldrs-ai/Share/issues/1508" target="_blank" rel="noopener noreferrer">#1508</a>); PR3 (switchover) is post-MVP, so GitHub keeps riding on the Auth0 sign-in (<a href="https://github.com/bldrs-ai/Share/issues/2202" target="_blank" rel="noopener noreferrer">#2202</a>).
- `identity-120` (<a href="https://github.com/bldrs-ai/Share/issues/1422" target="_blank" rel="noopener noreferrer">#1422</a>); `identity-300` picker and "Saving as X" footer.

**Exit:** a returning user can tell which identity they're signed in with, and is billed under it (`identity-120`). Browsing and saving to two GitHub accounts waits on `identity-t100` PR3.

### Phase C: Sharing v1
**Goal:** share a model privately by default, with its audience shown plainly; save to Drive.
- `share-200` link-resolver slice: unguessable tokens resolving to an exact version (`model-versioning.md` §5a), the part of `share-200` that `share-130` needs.
- `share-130`: private-by-default links and the visibility chip (`share-t100` chip, <a href="https://github.com/bldrs-ai/Share/issues/2206" target="_blank" rel="noopener noreferrer">#2206</a>). The unguessable link comes from `share-200`'s resolver.
- `share-110`: Drive Save (<a href="https://github.com/bldrs-ai/Share/issues/2205" target="_blank" rel="noopener noreferrer">#2205</a>).
- `share-120`: the Share and sign-in flow with its upgrade prompt (<a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>).
- `grow-200` OG image written with the share, if that is the chosen mechanism.

**Exit:** a user shares a private model by link, the recipient sees who can open it, and the link unfurls with a thumbnail.

### Phase D: Subscribe
**Goal:** the Pro tier exists and bills under the decided paywall (free viewing with no login for local and public models; free account with 2 private models per rolling 7 days; Pro unlimited). **Met (as of 2026-11-10):** Stripe is live and slot quotas are default-on (private opens and private/local exports share the 2 slots; public exports need no slot; local viewing is unmetered). The v0.4 size/complexity axis was a proposal and was not adopted.
- Billing is documented in `design/new/quotas.md`, `design/new/glb-export-premium.md` and `design/new/netlify-functions-testing.md`; no separate billing doc is planned.
- Remaining: Pro upsell in the Share dialog (`share-120`, <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>).

**Exit:** a free user hits the paywall and can upgrade in two clicks (met); the funnel answers the conversion question.

### Phase E: Public-launch checklist
**Goal:** the public site is ready for cold traffic.
- `open-130` / `open-t100` recents HEAD-check (<a href="https://github.com/bldrs-ai/Share/issues/2261" target="_blank" rel="noopener noreferrer">#2261</a>; <a href="https://github.com/bldrs-ai/Share/issues/1548" target="_blank" rel="noopener noreferrer">#1548</a> closed as of 2026-11-10).
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
- What compounds: the semantic API as the agent-binding layer (MCP, `apps-t300`), no-upload data sovereignty, the toolbelt flywheel.
- Success metric: **a handful of large-model, enterprise-profile users doing AI-on-a-model they can do nowhere else, and paying**, outweighs any amount of free small-model traffic.

### 7.2 Architecture: three surfaces

1. **Left drawer: workspace nav** (`open-200`) — projects and company-level nav; UI/routing only.
2. **Conversational panel** (`assist-310`, `assist-400`) — direct replies to the AI are commands; general channel talk is human-to-human, the AI comment-only.
3. **Right drawer: AI-apps toolbelt** (`assist-320`) — agent-generated apps saved, versioned and run in a sandbox over an MCP bridge.

One contract: the viewer is an MCP server (`apps-t300`) consumed by the agent and the sandboxed apps.

This arc stays post-MVP (per the owner, 2026-11-10); `design/new/conversational-cad.md` §5.1 now gathers the open permissions questions.

Constraints:
- **Data sovereignty is load-bearing.** Model bytes stay client-side; only conversation and tool results cross the wire, and that boundary should be explicit and user-visible. A broker that proxies model content wholesale would forfeit the story.
- **Read first, edit as the north star.** AI.2 ships the read/annotate loop; editing (AI.5) is the headline but must not outrun its substrate (`create-t300`).

### 7.3 What it absorbs

- `search-310` Knowledge graph: the retrieval layer behind conversational QA.
- `apps-300` Public API: MCP-first, one contract for external and internal consumers.
- `apps-310` Bldrs Integrate: agent-run model checks as toolbelt apps.
- `notes-*` / channels: one coherent story needed (§10).

### 7.4 Sequencing

The pivot **follows the MVP**: Phases B–D give it identity, sharing and the metering rails; metered agent usage is the natural Pro anchor. Foundations that can't destabilise launch may start earlier behind flags.

- **AI.0 — Design doc + seed repair.** Done: design doc landed (as of 2026-11-10). Seed repair remaining: fix <a href="https://github.com/bldrs-ai/Share/issues/1386" target="_blank" rel="noopener noreferrer">#1386</a> and re-enable the iframe suite.
- **AI.1 — Workspace shell.** `open-200` (<a href="https://github.com/bldrs-ai/Share/issues/1657" target="_blank" rel="noopener noreferrer">#1657</a>), `?feature=workspace`; no AI dependency, can overlap MVP phases. Shipped behind the flag (drawer, top bar, relocations); layout decided 2026-11-10 and refined 2026-11-18: the left nav lists each project's models and sessions (`design/reqs/workspace.md`).
- **AI.1a — Fluid Nav + scoped search.** `search-320` (<a href="https://github.com/bldrs-ai/Share/issues/1658" target="_blank" rel="noopener noreferrer">#1658</a>); standalone viewer value if AI.2 slips. Not started.
- **AI.2 — Agent v0, single-user.** `assist-310` (<a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a>): MCP tool surface (`apps-t300`) + agent loop (`assist-t300`) + panel. The demo that sells the pivot, and it must run on a large model; refresh `grow-400` with it. Status: tool registry v0 and a prototype bot exist behind flags; the agent loop is the next build step, and the bot port must move onto the engine worker's async read surface.
- **AI.3 — Toolbelt.** `assist-320`: generate, save, version, run over the same MCP surface.
- **AI.4 — Multi-user.** `assist-400` (<a href="https://github.com/bldrs-ai/Share/issues/1660" target="_blank" rel="noopener noreferrer">#1660</a>): shared channels, presence; the largest new backend piece.
- **AI.5 — Editing loop (north star).** Agent-driven modification through the same contract on the `create-t300` op log (`create-300`..`create-320`, <a href="https://github.com/bldrs-ai/Share/issues/1914" target="_blank" rel="noopener noreferrer">#1914</a>); only IFC/STEP export of an edited model still needs a Conway writer.

AI.2 is the earliest point at which the pivot is publicly visible.

### 7.5 What proves it

The benchmark proves the engine, not the business. Validation target: **large-model, enterprise-profile users running the AI loop on models they can't use anywhere else — paying**. Watch: `grow-120` size buckets (do large models show up?), conversion of users who hit the paywall, and design-partner outreach (bizdev-owned). A few such users outweigh any aggregate traffic number.

## 8. Post-MVP backlog (loveable)

Held over for after Phase E; items marked **→ §7** ride the pivot instead. Roughly in order of product pull:

1. `view-300` ETL / Table view 🔮 (❤️ Markus).
2. `open-210` View several models together (<a href="https://github.com/bldrs-ai/Share/issues/1251" target="_blank" rel="noopener noreferrer">#1251</a>).
3. `view-200` Persistent visibility URL encoding (<a href="https://github.com/bldrs-ai/Share/issues/1250" target="_blank" rel="noopener noreferrer">#1250</a>).
4. `view-210` Selection camera + measurement (<a href="https://github.com/bldrs-ai/Share/issues/1044" target="_blank" rel="noopener noreferrer">#1044</a>, <a href="https://github.com/bldrs-ai/Share/issues/1047" target="_blank" rel="noopener noreferrer">#1047</a>).
5. `share-t101` Phase 6 shared cache tier.
6. `share-t100` PR4 folder-scoped routes.
7. `notes-200` BCF round-trip.
8. `notes-t200` portable notes/versions for Drive.
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
20. `share-200` Model versioning and sharing ([#2144](https://github.com/bldrs-ai/Share/issues/2144)): S0 feasibility → V0 whole-file history → S1 public links; V1+ semantic stages coordinate with `create-t300` / AI.5. [Milestones and dispatch](new/model-versioning.md#8-milestones-and-acceptance-gates).

## 9. Issues and wiki

Standing convention (the original migration is done):
- One `epic`-labeled issue per Epic, titled `epic: <id>: <name>`, with native sub-issues per story sharing the epic's name (`CLAUDE.md`).
- Bizdev planning rows link to the implementing Share epics ("Implemented by"); epics carry a back-link comment.
- The wiki page `Planning:-Requirements` mirrors this doc as a public-facing summary (no implementation links or MVP-impact rows).

## 10. Open questions

- **Model-version hosting.** `share-200` S1 needs a proven public blob provider, retention/operating policy and browser upload/read path; GitHub is the initial metadata-remote recommendation. No free/permanent-hosting promise or private-storage rollout is implied ([design](new/model-versioning.md)).
- **Free-tier numbers.** Public anonymous share TTL, public hosting size ceiling (<10MB per <a href="https://github.com/bldrs-ai/Share/issues/1421" target="_blank" rel="noopener noreferrer">#1421</a>), refresh-token-mint rate.
- **BCF priority.** Industry credibility vs cost; MVP scope or §8 item 7.
- **Engine write path.** IFC/STEP export of edited models needs a Conway writer; scope in `create-engine.md` Part B.
- **Conversation store** for `assist-400` (GitHub-issue-backed, Firestore, purpose-built) and whether channels and Notes are one primitive.
- **Sessions.** Decided 2026-11-18: a session is a conversation thread over one or more of a project's models, and conversations are keyed to the session. A model opened alone has no session (a chat icon starts one), sessions can be ungrouped, and session workers are on demand; see `design/new/workspace-sessions.md` §8 (UX: `design/reqs/workspace.md`). The ref separator is still to pick.
- **Unit of "private"** under sessions and projects (`conversational-cad.md` §5.1).
- **Sandbox security model** for toolbelt apps: origin isolation, tool permissioning, provenance (`apps-t300`).
- **AI naming.** "Assist" is the working verb; the user-facing name is unpicked.
- **OG image mechanism** (decides whether `grow-200` finishes in Phase G or Phase C): tracked in <a href="https://github.com/bldrs-ai/bizdev/issues/371" target="_blank" rel="noopener noreferrer">bizdev#371</a>.

**Decided:** the ❤️ name markers are kept as the record of former teammates' requests (2026-11-10). Unplaced epics: <a href="https://github.com/bldrs-ai/Share/issues/1601" target="_blank" rel="noopener noreferrer">#1601</a> is a `view-t100` sub-track and <a href="https://github.com/bldrs-ai/Share/issues/2048" target="_blank" rel="noopener noreferrer">#2048</a> attaches to `identity-300`. Paywall wording reconciled with the shipped rule (§4.9, Phase D); the size/complexity axis was not adopted. Agent runtime placement (2026-10): the loop runs client-side, a thin `ai-chat` relay holds the hosted key and meters credits, BYOK goes direct (`ai-workspace.md` D1, D2, D6). Edit-log location: an op log over the immutable source, Share-side (`model-edit.md`).

## 11. Doc maintenance

- **Epic ships:** update its row in §3.1 and its issue, and the group's status if it changed; drop it from §6 phases.
- **Track slice lands:** update its tracking issue, and its row in §3.2.
- **New Epic:** open its epic issue, then add it under its verb group in the milestone band it is needed for (§2.1) at the next free ten, with a §3.1 row linking the issue; don't renumber existing IDs. An epic without an issue gets a short entry in §4 until it has one.
- **Tier change** is a deliberate renumber: add it to the ID lineage table, and update §6.0 if it crosses the 100 band.
- **Don't delete done Epics:** they stay as one-liners.
- **Stay short:** implementation detail, scope, decisions and per-PR notes go in the epic's issue or its `design/new/` doc, not here.
- **Privacy firewall:** this doc is public. Growth/traffic numbers (spend, CAC, geo, raw counts) and bizdev decision outcomes never land here; event names, stage definitions and qualitative conclusions are fine.

# Changelog

- **v0.22 (2026-11-23):** every epic and track now has an issue, so §4 (epic catalogue) and §5 (tracks) are retired to short notes. Created epic issues for `share-100`, `identity-100`, `identity-110`, `identity-300`, `apps-100`, `apps-110`, `apps-300`, `apps-310`, `assist-320`, `community-100`, `community-110`, `community-200`, `subscribe-100`, `subscribe-110`, `subscribe-120` and `subscribe-400` (<a href="https://github.com/bldrs-ai/Share/issues/2284" target="_blank" rel="noopener noreferrer">#2284</a>–<a href="https://github.com/bldrs-ai/Share/issues/2299" target="_blank" rel="noopener noreferrer">#2299</a>) and tracking issues for `view-t100`, `open-t100`, `subscribe-t100`, `assist-t300` and `create-t300` (<a href="https://github.com/bldrs-ai/Share/issues/2300" target="_blank" rel="noopener noreferrer">#2300</a>–<a href="https://github.com/bldrs-ai/Share/issues/2304" target="_blank" rel="noopener noreferrer">#2304</a>; `subscribe-t101` is its epic <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a>). The top status section became a status paragraph per verb group in §3.1; §3.2 gained Issue and Docs columns; "Relation to the bizdev planning set" moved to the end. Status that was stale in the move was corrected from the issues (the assistant's agent loop and hosted relay exist; the in-app switch is on by default; the render look is on by default). No IDs changed, §6.0 is unchanged. Evidence: [share-100-triage.md](reqs/share-100-triage.md), [identity-100-triage.md](reqs/identity-100-triage.md), [apps-100-triage.md](reqs/apps-100-triage.md), [community-100-triage.md](reqs/community-100-triage.md), [subscribe-100-triage.md](reqs/subscribe-100-triage.md).
- **v0.21 (2026-11-23):** View, Search, Notes & Versions follow the Open pattern. Created epic issues for `view-100`, `view-110`, `view-120`, `view-130`, `view-200`, `view-210`, `view-230`, `view-300`, `search-100`, `search-300`, `notes-200`, `notes-300`, `versions-300` and `versions-310` (<a href="https://github.com/bldrs-ai/Share/issues/2270" target="_blank" rel="noopener noreferrer">#2270</a>–<a href="https://github.com/bldrs-ai/Share/issues/2283" target="_blank" rel="noopener noreferrer">#2283</a>); linked `notes-100`'s existing epic (<a href="https://github.com/bldrs-ai/Share/issues/670" target="_blank" rel="noopener noreferrer">#670</a>) and pointed `search-310` at the assistant epic that absorbed it (<a href="https://github.com/bldrs-ai/Share/issues/1659" target="_blank" rel="noopener noreferrer">#1659</a>). Existing stories were retitled and nested under them (`view-100`…`view-210`, `view-230`, `view-300`, `search-100`, `notes-200`). §4's View, Notes & Versions and Search groups are removed: their text is in the epics. No IDs changed, §6.0 is unchanged. Evidence: [view-100-triage.md](reqs/view-100-triage.md), [search-100-triage.md](reqs/search-100-triage.md), [notes-200-triage.md](reqs/notes-200-triage.md).
- **v0.20 (2026-11-23):** reconciled the Open epics with the UX rubric. Created epic issues for `open-100`, `open-110`, `open-120`, `open-130` and `open-300` (<a href="https://github.com/bldrs-ai/Share/issues/2258" target="_blank" rel="noopener noreferrer">#2258</a>–<a href="https://github.com/bldrs-ai/Share/issues/2262" target="_blank" rel="noopener noreferrer">#2262</a>), each with its stories; gave `open-205` two UX stories and nested eight of its 18 technical children under them (<a href="https://github.com/bldrs-ai/Share/issues/2021" target="_blank" rel="noopener noreferrer">#2021</a>, <a href="https://github.com/bldrs-ai/Share/issues/2265" target="_blank" rel="noopener noreferrer">#2265</a>) and moved its decision log to `design/new/in-app-model-switch.md` §0; renamed the Open rows to their epic titles (`open-210` was "Open multiple IFCs in one session"); corrected §4.1's stale `open-200` text. Retired §4 for every epic that has an issue (29 of its 58 entries; Open, Grow and Create are now empty): descriptions live in the issues, and what an issue lacked (the `share-200` MVP slice, `subscribe-130` parked, the `share-140` default-on status, and seven smaller placements) was added to ten of them (#1421, #2144, #57, #1831, #1658, #1422, #1524, #1659, #1660, #1920). §4 keeps only epics without an issue. No IDs changed, §6.0 is unchanged. [Reconciliation evidence](reqs/open-100-triage.md), [`open-205`](reqs/open-205-triage.md).
- **v0.19 (2026-11-18):** moved `share-200`'s link-resolver slice into Phase C, so `share-130`'s private links can ship in the MVP; the rest of `share-200` stays post-MVP (owner's decision). Closes the open question v0.16 added.
- **v0.18 (2026-11-18):** renamed the tracks `<feature>-t<band><nn>` per the DX rubric (`design/dx/dx-rubric.md`), each named for its primary feature group and band; T9 stays with bizdev. ID lineage amended.
- **v0.17 (2026-11-18):** renumbered the workspace epic (#1657) from `assist-300` to `open-200` (per the owner: projects list models and sessions as assets, the base of the `open-2xx` epics), and Recents reliability from `open-200` to `open-130`; ID lineage amended.
- **v0.16 (2026-11-18):** reconciled the `share-*` epics and Tracks T2, T3, T4 and T6 with what shipped, and gave each a tracking issue (<a href="https://github.com/bldrs-ai/Share/issues/2201" target="_blank" rel="noopener noreferrer">#2201</a>–<a href="https://github.com/bldrs-ai/Share/issues/2208" target="_blank" rel="noopener noreferrer">#2208</a>). Owner's decisions: `share-110` is Drive Save only; `share-130` is private-by-default links and the chip, with links from `share-200`'s resolver; `share-201` is post-MVP; T3 PR3 and T2 Phases 4–6 are post-MVP; T6 owns `notes-300` and `versions-310`, with one version manifest. Phases B and C, §6.0 and the open questions updated to match.
- **v0.15 (2026-11-18):** parked `grow-100` (format landing pages) until `grow-120` measures how many real model opens arrive by organic search (owner's decision, <a href="https://github.com/bldrs-ai/bizdev/issues/368" target="_blank" rel="noopener noreferrer">bizdev#368</a>). It leaves the §6.0 MVP list, and Phase G's goal and exit drop the landing pages.
- **v0.14 (2026-11-18):** moved the `grow-*` epics (§4.10, Track T9, Phase G's work list) to the private bizdev repo, which now holds their status and stories; codes and aliases unchanged. Flagged the conflict between §6.0's `grow-100` and bizdev's parked SEO issue as bizdev#368.
- **v0.13 (2026-11-12):** reconciled basic Versions UX under existing tracker #57; the new local save, history, update and backup stories (#2157–#2160) carry a milestone hypothesis rather than an MVP claim (`design/reqs/ux-rubric.md` §"Milestones are hypotheses"), and §6.0 is unchanged; corrected #890's deletion scope and preserved its historical milestone. Later semantic requirements retain existing `share-200` #2144; `versions-300` structural diff and `versions-310` portable Drive assignments and aliases remain unchanged. [Reconciliation evidence](reqs/versions-100-triage.md).
- **v0.12 (2026-11-11):** assigned #2144 model versioning and sharing to `share-200`, moved per-principal grants to `share-201` across current references, and added the implementation design/dispatch plan. Whole-file public sharing is independent of later T12 semantic editing; existing Phase C private-sharing scope and the MVP bar are unchanged.

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

Every epic that has ever been renumbered (all others have been stable since v0.2). Resolve any ID in an older branch, issue or PR through this table; several numbers were **reused across revisions** (`share-120`, `share-130`, `share-200`, `open-130`, `open-200`, `view-130`, `view-220`, `view-230`, `assist-300`), and `subscribe-100/110/120` were restored to their original meanings.

| Epic (current name) | v0.2–v0.4 | v0.5 | v0.6–v0.11 |
|---|---|---|---|
| Recents that tell you when a model is gone | open-150 | open-130 | `open-200` |
| View several models together | open-140 | open-200 | `open-210` |
| Open from any account I've connected | open-130 | open-300 | `open-300` |
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

### v0.12 amendments (2026-11-11)

The user-requested reassignment below is deliberate; historical `share-200` references must be interpreted by revision and name, not blindly replaced.

| Epic (current name) | v0.6–v0.11 | v0.12 (current) |
|---|---|---|
| Grant/revoke per-principal sharing | `share-200` | `share-201` |
| Model versioning and sharing: git + progressive decomposition (#2144) | — (new) | `share-200` |

### v0.17 amendments (2026-11-18)

The workspace is an Open feature: a project lists its models and sessions as assets (owner). Its new 2xx code also moves it from the Pro band to MLP. Recents is a variation on the 1xx open capabilities and returns to its v0.5 code.

| Epic (current name) | v0.6–v0.16 | v0.17 (current) |
|---|---|---|
| Workspace: projects, their models and sessions (#1657) | `assist-300` | `open-200` |
| Recents that tell you when a model is gone | `open-200` | `open-130` |

### v0.18 amendments: tracks (2026-11-18)

Tracks are named for their primary feature group and the band of the epics they mainly serve (`design/dx/dx-rubric.md` §"Naming"). T9, growth, lives in bizdev and keeps its number.

| Track (current name) | Before v0.18 | v0.18 (current) | Tracking issue |
|---|---|---|---|
| Viewer Replacement | T1 | `view-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2300" target="_blank" rel="noopener noreferrer">#2300</a> |
| GLB Model Sharing | T2 | `share-t101` | #2201 |
| Identity Decoupling | T3 | `identity-t100` | #2202 |
| Multi-User Sharing | T4 | `share-t100` | #2203 |
| Drive Recents HEAD-check | T5 | `open-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2301" target="_blank" rel="noopener noreferrer">#2301</a> |
| Notes & Versions sidecar formats | T6 | `notes-t200` | #2204 |
| Ads | T7 | `subscribe-t101` | <a href="https://github.com/bldrs-ai/Share/issues/1524" target="_blank" rel="noopener noreferrer">#1524</a> (epic) |
| Pro/Billing | T8 | `subscribe-t100` | <a href="https://github.com/bldrs-ai/Share/issues/2302" target="_blank" rel="noopener noreferrer">#2302</a> |
| Agent runtime & conversation store | T10 | `assist-t300` | <a href="https://github.com/bldrs-ai/Share/issues/2303" target="_blank" rel="noopener noreferrer">#2303</a> |
| App sandbox + MCP bridge | T11 | `apps-t300` | <a href="https://github.com/bldrs-ai/Share/issues/2225" target="_blank" rel="noopener noreferrer">#2225</a> |
| Model edit substrate | T12 | `create-t300` | <a href="https://github.com/bldrs-ai/Share/issues/2304" target="_blank" rel="noopener noreferrer">#2304</a> |

## Relation to the bizdev planning set

Business priority, ICP validation gates and pricing live in the **private** `bldrs-ai/bizdev` planning issues (<a href="https://github.com/bldrs-ai/bizdev/issues/289" target="_blank" rel="noopener noreferrer">bizdev#289</a>–<a href="https://github.com/bldrs-ai/bizdev/issues/336" target="_blank" rel="noopener noreferrer">bizdev#336</a>; convention in bizdev `docs/planning.md`, landed). This roadmap owns technical design and sequencing. Bizdev rows link to the Share epics that implement them, and those epics carry a back-link comment. Bizdev links resolve only for org members.

Where the plans disagree, the decision is tracked as a bizdev `decision` issue and this doc is updated once it is decided.
- **Decided (see the issue):** <a href="https://github.com/bldrs-ai/bizdev/issues/331" target="_blank" rel="noopener noreferrer">bizdev#331</a> paywall axis (shipped rule in §3.1, Subscribe); <a href="https://github.com/bldrs-ai/bizdev/issues/334" target="_blank" rel="noopener noreferrer">bizdev#334</a> Pro price.
- **Open:** <a href="https://github.com/bldrs-ai/bizdev/issues/332" target="_blank" rel="noopener noreferrer">bizdev#332</a> billing timing vs Phase D; <a href="https://github.com/bldrs-ai/bizdev/issues/333" target="_blank" rel="noopener noreferrer">bizdev#333</a> hosting for originator save; <a href="https://github.com/bldrs-ai/bizdev/issues/335" target="_blank" rel="noopener noreferrer">bizdev#335</a> AI/editing work ahead of plan vs bizdev's discovery rule; <a href="https://github.com/bldrs-ai/bizdev/issues/336" target="_blank" rel="noopener noreferrer">bizdev#336</a> channels: Collab repo vs in-app ChannelProvider (`assist-400`).
