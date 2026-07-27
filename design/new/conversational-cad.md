# Share × Conversational CAD — epic plan

**Status:** v0.2 — plan agreed; roadmap v0.7 deltas applied; tracking issues live
**Date:** 2026-07-27
**Owner:** Pablo
**Wireframes:** "Share × Conversational CAD — production merge wireframes"
(2026-07). Legend markers cited below as **W1…W9** (W8 = BottomBar, W9 =
bottom-center section tools).

This doc turns the roadmap's §7 AI-workspace pivot into a concrete four-epic
plan matched to the production-merge wireframes: what each epic contains, how
the sequence maps onto existing roadmap IDs, and how we track it in GitHub
(tracking issue + sub-issues per epic — §7 below settles the process
question). Draft issue bodies are in §8 so creation is mechanical once the
plan is agreed.

**Division of labor with `ai-workspace.md`:** the roadmap (§7.4 AI.0) calls
for `design/new/ai-workspace.md` to answer the *architecture* questions —
agent runtime placement, LLM provider strategy, conversation-store choice,
sandbox/MCP security model. Those stay there (still to be drafted). This doc
owns the *product* plan: UI decomposition, epic sequencing, and issue
structure. Epic 3 depends on `ai-workspace.md` existing first.


## 1. Mapping the sequence onto the roadmap

The four-step sequence corresponds almost 1:1 to the roadmap's Assist group
(§4.11) and pivot stages (§7.4) — only step 2 is genuinely new:

| # | This plan | Roadmap ID | Pivot stage | Tracking issue |
|---|---|---|---|---|
| 1 | Base UI reorg (projects drawer, top bar) | `assist-300` | AI.1 | [#1657](https://github.com/bldrs-ai/Share/issues/1657) |
| 2 | Search + Nav upgrade | `search-320` (new in roadmap v0.7) | AI.1a | [#1658](https://github.com/bldrs-ai/Share/issues/1658) |
| 3 | Conversational CAD w/ AI | `assist-310` + T10 + T11 | AI.2 | [#1659](https://github.com/bldrs-ai/Share/issues/1659) |
| 4 | Multi-user + Social | `assist-400` + `assist-410` (backlog) | AI.4 | [#1660](https://github.com/bldrs-ai/Share/issues/1660) |

Why Search+Nav sits second, between shell and agent: the conversational
panel constantly *references elements* — AI replies carry element chips, the
composer needs element lookup, breadcrumbs anchor scope. That referencing UX
is exactly what the Search+Nav epic builds, so landing it before the agent
means the agent's output has somewhere fluent to point. It also has
standalone user value if the AI arc slips: TopBar search + fluid NavTree is
a viewer improvement on its own.

The toolbelt (`assist-320`, AI.3) is *not* one of the four epics here — it
stays sequenced per the roadmap after the agent v0 and isn't re-planned by
this doc. Same for the editing loop (AI.5).


## 2. Epic 1 — Workspace shell (`assist-300`)

Turns Share's chrome from single-document viewer into workspace: a projects
drawer on the far left, a real top bar, and relocated header controls.
Everything behind `?feature=workspace` (flag name already reserved in
roadmap §7.4 AI.1). Pure UI + routing + state — no AI-runtime dependency, so
it can overlap the MVP phases without destabilising them.

### 2.1 ProjectsDrawer (W1)

New leftmost container in `RootLandscape.jsx` — "further left" than the
current `NavTreeAndVersionsDrawer`, in the Claude-Code position. Hierarchy:

```
project → models (files) → conversations   (convos come in Epic 3)
```

- "New project" button; projects expand/collapse; models listed under each.
- Opening happens here: `OpenModelControl` leaves `ControlsGroup.jsx` (W3);
  adding a model to a project routes through the existing tabbed Open dialog
  (local / GitHub / Drive). `SaveModelControl` stays where it is, auth-gated.
- NavTree + Versions controls stay in place for this epic (they move in
  Epic 2).
- Collapse toggle next to "New project" (W1 marker in the top bar).

### 2.2 Project struct + persistence tiers

A project is a named grouping over model references — reuse the shape recents
already use for model identity (GitHub path / Drive fileId / local OPFS
name), don't invent a second one.

- **Tier 1 (this epic): local-only.** Zustand-persisted (localStorage) — the
  same durability class as recents today. Anonymous users get projects too;
  they just don't roam.
- **Tier 2 (follow-up story, logged-in only): Auth0-backed.** Store the
  project struct in Auth0 `user_metadata` keyed by `sub` — no new backend.
  Constraints to respect: `user_metadata` is small-JSON scale (fine for a
  project/model list, wrong for conversation content), per-user not per-org,
  and read at login — so it's a sync/merge target for the local store, not a
  live database. If/when projects need sharing or org scope, that's a real
  store decision that belongs to the T10 conversation-store question — don't
  solve it here.

### 2.3 TopBar (W2)

The 58px `ToolbarPaper` placeholder in `RootLandscape.jsx` becomes a real
`TopBar` container: **project / file breadcrumb + element search**.
`SearchControl`/`SearchBar` move out of `ControlsGroup.jsx`. Search backend
exists (`search-100`); this epic only relocates the entry point — the scope
mechanics are Epic 2.

### 2.4 Profile + Share relocate (W4)

`ProfileControl` + `ShareControl` move from the `OperationsGroup.jsx` header
row into the TopBar (right side, next to presence in Epic 4). The remaining
top-right column keeps **Apps** (WidgetsIcon), **Notes** (ChatIcon),
**Properties** (FormatListBulletedIcon).

### 2.5 Logo popup — account + marketing (screen 4)

The bottom-left `bldrs.ai` logo opens a popup: "Build Every Thing Together";
links to **About / Pricing / News** (all existing routes on the marketing
SSG build — see `marketing/README.md`); tagline "Fastest browser-based CAD";
plus the manage-account entry point (profile/settings — coordinates with
`identity-300`'s profile drawer rather than duplicating it).

### 2.6 Icon tokens

Production MUI icons with no token yet in the packaged DS set, shown in the
wireframes via their MUI glyphs — add to `tokens/icons.css`: `Segment`
(NavTree), `History` (Versions), `Widgets` (Apps), `Visibility`,
`FilterCenterFocus` (Isolate), `HideSourceOutlined`, `Info`, `QuestionMark`.
All others use existing DS tokens.

### 2.7 Unchanged in this epic

BottomBar (W8: About, Elements breadcrumb, Help/Bot slot) and the
bottom-center section tools (W9: CutPlane / Visibility / Isolate / Hide)
stay as-is; W9's relocation-while-convo-open is Epic 3's W7 proposal.

### Acceptance (Playwright)

Create project → add model (each source type) → reload → project + models
persist → open model from drawer → element search from TopBar → all with
`?feature=workspace`; and the default (flag off) layout byte-identical to
today's screenshots.


## 3. Epic 2 — Fluid Nav + scoped search (proposed `search-320`)

The NavTree stops being a parked side-drawer and becomes something you
summon and filter; breadcrumbs become the scope control for search.

- **NavTree as dropdown/filterable list.** Summoned from the TopBar
  breadcrumb (and/or a keyboard shortcut), type-to-filter, virtualized for
  large models (the as1/NIST STEP corpora and large IFCs must stay
  responsive — reuse the existing NavTree virtualization rather than
  re-rendering the full tree in a popover).
- **Breadcrumb scope mechanic.** Moving focus up/down the breadcrumb
  segments broadens/restricts the search scope accordingly — hovering
  `Tower / Level 02 / Duct D-114` at `Level 02` scopes search to that
  subtree. The BottomBar Elements breadcrumb (W8) and the TopBar breadcrumb
  need one shared model of "current path"; decide in the epic whether they
  merge or the BottomBar one retires.
- **Selection/permalink invariants hold.** Element-path permalinks (#1180)
  and STEP occurrence-path selection/permalinks (PR #1581,
  `step-occurrence-selection.md`) must round-trip identically through the
  new surfaces — the dropdown is a new *view* over the same
  `selectItemsInScene` funnel, not a new selection source of truth.
- **Open question:** does `NavTreeAndVersionsDrawer` retire entirely (Versions
  needs a new home — candidate: TopBar breadcrumb's file segment, per the
  wireframe's history icon) or shrink to Versions-only?

Fold-in: `search-100`'s open story #1254 (search by element name with scene
highlighting) naturally lands inside this epic's E2E.

Tier note (§9): proposed as `search-320` — Pro band, since it rides the
pivot arc (§2.1 rubric: the milestone that doesn't happen without it is the
pivot, not the MVP trickle). If we decide it's wanted regardless of the
pivot, it renumbers to `search-200` (MLP) per the maintenance rules.


## 4. Epic 3 — Conversational CAD (`assist-310` + T10/T11)

The conversation panel over the open model, single-user first, behind
`?feature=convo` (W6). The multi-user mechanics stay in Epic 4.

- **Convo tray + drawer threads (W6, W1b).** Conversations become the third
  level of the ProjectsDrawer hierarchy (project → models → convos, e.g.
  "Roof plant access review"); the tray sits above the BottomBar (which
  could later absorb the Bot slot — W8). AI replies styled distinct (accent
  avatar + tinted bubble); composer carries a model-context chip.
- **Conversation drives the UI.** The agent's tool surface is T11's MCP
  contract: camera/focus, select, isolate/hide (single element and bulk),
  properties/psets, model queries, notes. First consumer is the in-process
  agent; the sandboxed-app transport comes later with `assist-320`.
- **Permalink anchors in messages.** Element chips and view anchors inside
  messages reuse the *existing* permalink machinery — camera hash
  (`view-120`), element paths (#1180), occurrence paths (PR #1581) — so a
  chip click is an in-app navigation (no reload), and copying a message
  out of Share still yields working deep links. This is the cheapest
  high-leverage slice: the whole anchor system already exists, the epic
  wires it into message rendering.
- **Reduced tool set while convo visible (W7 — proposal, TBD).** The
  bottom-center section cluster folds into the right column plus an active
  Conversation toggle; top-left ControlsGroup hidden; full layout returns
  when the tray closes. Prototype it behind the same flag; keep it a
  separate story so it can be dropped without dragging the epic.
- **Prereqs.** (a) `ai-workspace.md` drafted first — runtime placement,
  provider strategy, store choice, and the data-sovereignty boundary (model
  bytes stay client-side; only conversation + tool results cross the wire —
  roadmap §7.2) are decided there, not improvised mid-epic. (b) #1386
  iframe repair is a T11 pre-condition for the *sandbox* half but does not
  block the in-process agent — don't serialize on it.
- **Persistence, initially:** per-model conversation log stored with the
  Tier-1 project struct (local). Durable/shared storage is Epic 4's
  problem; don't build a throwaway backend here.
- **Demo bar (roadmap §7.4 AI.2):** the sell-the-pivot demo runs on a large
  model. Keep a large-model fixture in the E2E loop from the start.


## 5. Epic 4 — Multi-user + Social (`assist-400` + proposed `assist-410`)

Mostly *scoping* at this stage — the deliverable of the first story is a
design, not code.

- **Presence (W5).** Avatar stack + per-thread unread badges in TopBar and
  drawer, stubbed behind `?feature=presence` so the UI shape can be
  reviewed before any backend exists.
- **ChannelProvider abstraction.** The user-visible feature is shared
  channels with the direct-address-vs-comment-only AI mechanic (roadmap
  §7.2.2). The scoping work here is the abstraction layer beneath it:
  a provider interface for **permissions + persistence** with pluggable
  backends — matrix.org, Discord, Slack — following the provider-pattern
  precedent already in the codebase (T3 `ConnectionProvider`, T4 sharing
  providers). This *is* the roadmap §10 "conversation store" open question,
  sharpened: matrix.org is the structurally interesting candidate (open
  protocol, rooms ≈ channels, ACLs ≈ grants, federation ≈ BYOS — the same
  bring-your-own-storage shape as the rest of the product), with
  Discord/Slack as bridge plugins for where teams already live. The scoping
  doc must answer: are channels and Notes one primitive or two (§10)?
- **`assist-410` Social broadcast (proposed, thin).** Plugins for
  broadcasting screencasts to YouTube and X. Placeholder epic so the intent
  has an ID; recommend it enters the roadmap as a §8 backlog item until
  something pulls on it — it shares the plugin seam with ChannelProvider
  but none of its urgency.


## 6. Sequencing vs the MVP

Nothing here changes the v0.6 call that the Assist arc is out of the MVP
band — the pivot follows the trickle (§6.0, §7.4). Practical consequences:

- Every epic ships behind its flag (`workspace`, `convo`, `presence`;
  Epic 2 proposes its own `navSearch` flag rather than riding `workspace`,
  so the two UI arcs can flip independently). Default-off until each arc's
  screenshot baselines + E2E are in.
- Epic 1 and 2 are pure UI and may overlap MVP Phases A–E as capacity
  allows. Epic 3 waits for `ai-workspace.md` and should land after Phase D
  if agent usage is metered (the natural Pro anchor — §7.4). Epic 4 is last.
- Flag-off layout is a screenshot-tested invariant: the merge into
  production `RootLandscape` must be invisible until flipped.


## 7. Process: how we track this (recommendation)

Short answer to "each one of these is an epic, with a tracking issue and
sub-issues?" — **yes, and the repo already defines exactly that machinery**
(roadmap §1 + §9); the gap has been execution, not process design. Concretely:

1. **One `epic`-labeled tracking issue per epic**, titled with the stable
   ID: `epic: assist-300: Workspace shell — projects drawer + top bar`.
   Body stays short and links to the section of this doc + the roadmap
   block — docs are the source of truth for structure; issues are the
   source of truth for *state* (who's on it, what's merged). Don't
   duplicate spec text into issue bodies; it forks.
2. **Stories as native GitHub sub-issues** of the epic (via
   `sub_issue_write`), `story`-labeled, one per user-visible slice with a
   Playwright spec as the acceptance gate (existing rule). Native
   sub-issues over task-list checkboxes at this level: you get progress
   rollup on the epic and queryability. Checkboxes live *inside* stories
   for tasks, as today.
3. **The wireframe legend is the story seed for Epic 1** — W1–W4 + icon
   coverage map to sub-issues nearly 1:1 (§8 drafts).
4. **Milestones (optional):** if used, one per pivot stage (AI.1, AI.2, …),
   not per epic — stages are the shippable increments; epics can span them.
5. **Sign-off gate preserved:** per roadmap §9, nothing below is
   bulk-created without review of this doc. Creating the four epic issues +
   Epic 1's sub-issues is a 15-minute mechanical pass once agreed.

Considered and not recommended: a GitHub Project board as the primary
tracker (fine as a *view* over the labeled issues, but a second source of
truth to drift); and one mega-epic for the whole pivot (too coarse — the
four epics have different prereqs and can be worked by different people).


## 8. Draft tracking issues

**Created 2026-07-27** as `epic`-labeled issues with `story`-labeled native
sub-issues (the drafts below are the record of what was filed):
- `assist-300` → [#1657](https://github.com/bldrs-ai/Share/issues/1657), stories #1661–#1667
- `search-320` → [#1658](https://github.com/bldrs-ai/Share/issues/1658), stories #1668–#1670 + existing #1254 attached
- `assist-310` → [#1659](https://github.com/bldrs-ai/Share/issues/1659), stories #1671–#1677
- `assist-400` → [#1660](https://github.com/bldrs-ai/Share/issues/1660), stories #1678–#1680

### epic: assist-300: Workspace shell — projects drawer + top bar
> Turns Share into a workspace: ProjectsDrawer (leftmost), TopBar
> (breadcrumb + search), relocated Profile/Share, logo popup. Behind
> `?feature=workspace`. Plan: `design/new/conversational-cad.md` §2;
> roadmap §4.11 / §7.4 AI.1. Wireframes: production-merge set, W1–W4.

Sub-issues:
- `story: workspace: ProjectsDrawer container + project→models struct (W1)`
- `story: workspace: local project persistence (Tier 1) + Auth0 user_metadata sync (Tier 2, logged-in)`
- `story: workspace: TopBar replaces ToolbarPaper — breadcrumb + search relocate (W2)`
- `story: workspace: OpenModelControl retires from ControlsGroup; open-via-drawer (W3)`
- `story: workspace: Profile + Share relocate to TopBar (W4)`
- `story: workspace: logo popup — About/Pricing/News + manage account (screen 4)`
- `story: workspace: DS icon tokens (Segment, History, Widgets, Visibility, FilterCenterFocus, HideSourceOutlined, Info, QuestionMark)`

### epic: search-320: Fluid NavTree + breadcrumb-scoped search
> NavTree as summonable, filterable dropdown; breadcrumb focus
> broadens/restricts search scope. Selection + permalink invariants
> (element-path, STEP occurrence-path) must hold. Behind
> `?feature=navSearch`. Plan: §3. Absorbs #1254.

Sub-issues: dropdown NavTree (virtualized, type-to-filter); breadcrumb
scope mechanic + unified current-path model; Versions re-home decision;
#1254 fold-in.

### epic: assist-310: Conversational agent panel (single-user)
> Convo tray (`?feature=convo`) + drawer threads; agent drives the viewer
> through the T11 MCP tool surface; message element-chips/anchors reuse
> existing permalink machinery. Prereq: `design/new/ai-workspace.md`
> (runtime/provider/store/sovereignty). Plan: §4; roadmap §7.4 AI.2;
> Tracks T10/T11. Wireframes W6, W7, W1b.

Sub-issues: `ai-workspace.md` design doc (AI.0); convo tray UI + drawer
threads (stub, no backend); message anchors/element chips over permalink
infra; viewer MCP tool surface v0 (read/annotate); agent loop v0 +
streaming; W7 reduced-tool-set proposal (separate, droppable); large-model
demo fixture + E2E.

### epic: assist-400: Multi-user channels + presence (+ ChannelProvider scoping)
> Presence stubs (`?feature=presence`, W5) + the ChannelProvider
> abstraction scoping: permissions + persistence plugins over
> matrix.org/Discord/Slack; channels-vs-Notes decision. Plan: §5; roadmap
> §7.2/§7.4 AI.4; Track T10.

Sub-issues: presence avatar/badge stubs; ChannelProvider scoping doc
(matrix-first evaluation, channels-vs-Notes); direct-address vs
comment-only routing design. (`assist-410` social broadcast: backlog item
only, no issue yet.)


## 9. Roadmap.md deltas (applied in roadmap v0.7, same PR as this revision)

1. **New epic `search-320`** — block in §4.5 + row in §3.1 (Pro band, Phase
   AI, Tracks: —). Body per §3 above.
2. **`assist-300` block:** add the persistence-tier note (local → Auth0
   `user_metadata`), the logo-popup scope, and a pointer to this doc +
   wireframes.
3. **`assist-310` block:** pointer to this doc; note convos-in-drawer and
   the permalink-anchor slice.
4. **`assist-400` block:** name the ChannelProvider abstraction and the
   matrix/Discord/Slack plugin framing as the sharpened form of the §10
   conversation-store question.
5. **§8 backlog:** add `assist-410` social broadcast plugins (YouTube/X
   screencasts) as a numbered item.
6. **§7.4:** insert `search-320` between AI.1 and AI.2 in the pivot
   sequence.

CLAUDE.md router row for this doc is added in the same commit as this file.
