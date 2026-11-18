# Assist 300 triage

**Reconciliation date:** 2026-11-18. **Epic:** [#1657](https://github.com/bldrs-ai/Share/issues/1657), retitled `assist-300: Workspace shell — projects, models and sessions`; its labels (`enhancement`, `epic`), state, comment and original body (collapsed at the bottom) are kept.

For the motivation and the story list, see the [scope snapshot](assist-300.md). This page is the record of how the issues were placed; progress and open decisions live in the issues.

## Ownership, tier and aliases

The [roadmap](../roadmap.md) §4.11 assigns the workspace shell to `assist-300`: UI and routing with no AI dependency, stage AI.1 of the AI-workspace pivot (§7.4), post-MVP per the owner (2026-11-10). The 3xx band is kept; nothing here changes the roadmap. [workspace.md](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md) (merged 2026-11-18) puts the left nav (projects, their models and sessions), opening a model directly, and keeping it all across reloads in this epic, and no new epic is created.

Aliases (roadmap "ID lineage"): the workspace shell was `assist-100` in v0.3–v0.5 and is `assist-300` from v0.6. The number was reused: in v0.5, `assist-300` meant multi-user channels, which is now `assist-400` ([#1660](https://github.com/bldrs-ai/Share/issues/1660)). Older issue titles use `epic: assist-300:`, `story: workspace:` and `flow: workspace:`; the feature flag is `workspace`.

## Inventory

Searched on 2026-11-18 with the GitHub search API, open and closed issues, titles and bodies, `repo:bldrs-ai/Share … is:issue`: `workspace in:title`, `ProjectsDrawer`, `TopBar`, `"logo popup"`, `assist-300`, `"workspace shell"`, `project in:title`, `projects in:title`, `"feature=workspace"`, `LogoMenu`, `ungrouped`, `breadcrumb in:title`, `Projects drawer`, `drawer in:title`, `"manage account"`, `icon tokens`, `OpenModelControl`, `session in:title`, `sessions`, `user_metadata`, plus the duplicate searches for the new story (`"Models and Sessions"`, `conversations drawer`, `convos`, `threads in:title`, `"Browse a project"`). No result set was marked incomplete. #1657's native sub-issues and #1661's were read directly.

Neighbours found and left with their owners: #1672 (`assist-310`, see below), #1668–#1670 and #1699 (`search-320`, #1658), #2011, #2019–#2031 and #2186 (`open-205`), #1251 (`open-210`), #1678 (`assist-400`), and #2048 (`identity-300`'s consent story). The remaining hits are out of scope and unchanged.

## Milestones

No issue in #1657's hierarchy has a milestone. Four milestones matched "project" and were expanded: [#5 Versions 300: Create BLD project](https://github.com/bldrs-ai/Share/milestone/5) (#735–#742, creating a new `.bld` model from scratch), [#48 Open 100: Open project from GH link](https://github.com/bldrs-ai/Share/milestone/48) ("project" meaning a hosted model), [#32 View 100: Navigate the project using element hierarchy](https://github.com/bldrs-ai/Share/milestone/32), and [#63 Unclear](https://github.com/bldrs-ai/Share/milestone/63) (#755, the retired project panel, with #758 and #763). None is about grouping models into workspace projects; all members are out of scope and unchanged.

## Crosswalk

Source: [workspace.md at 5dc1788](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md).

| Source | Owning issue |
|---|---|
| [L46–55](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L46-L55) Browse a project's models and sessions | [#2193](https://github.com/bldrs-ai/Share/issues/2193), new; baseline [#1661](https://github.com/bldrs-ai/Share/issues/1661) |
| [L57–65](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L57-L65) Open a model on its own, incl. the chat icon (L63) | [#1664](https://github.com/bldrs-ai/Share/issues/1664); baseline flows [#1690](https://github.com/bldrs-ai/Share/issues/1690), [#1691](https://github.com/bldrs-ai/Share/issues/1691) |
| [L67–71](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L67-L71) Keep projects, models and sessions across reloads | [#1662](https://github.com/bldrs-ai/Share/issues/1662) |
| [L25](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L25) flag-off layout | #1657, open decisions |
| [L118–122](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L118-L122) shared rules (privacy, accurate state, large models) | #1657, rules for every story, and the [UX index](README.md#requirements-shared-by-every-story) |
| [L130](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/reqs/workspace.md#L130) milestone hypothesis | this record, below |
| `assist-310` and `open-210` stories (L73–114) | not this epic; their reconciliations |

The chat icon went to #1664 rather than to #1661 or #2193. #1661 is a completed story and its flow #1691 is its record, so new requirements go to an open story; #1664's own outcome was opening models from the drawer, the nearest open story to "open a model on its own". Starting the session the icon asks for is `assist-310`'s.

## Placement of each issue

| Issue | Decision |
|---|---|
| [#1661](https://github.com/bldrs-ai/Share/issues/1661) closed | Formal story, retained as the baseline of #2193. Its eight flow issues [#1689–#1696](https://github.com/bldrs-ai/Share/issues/1689) stay under it as task issues, unchanged; they carry the `story` label from when they were filed. |
| [#1662](https://github.com/bldrs-ai/Share/issues/1662) open | Formal story, extended to sessions. Tier 1 (local) shipped with #1661; Tier 2 (account sync) isn't built. |
| [#1663](https://github.com/bldrs-ai/Share/issues/1663) closed | Formal story, retained. Breadcrumb-scoped search stays with `search-320` (#1669, #1699). |
| [#1664](https://github.com/bldrs-ai/Share/issues/1664) open | Formal story, extended to "open a model on its own". |
| [#1665](https://github.com/bldrs-ai/Share/issues/1665) closed | Formal story, retained; delivered by #1992. |
| [#1666](https://github.com/bldrs-ai/Share/issues/1666) open | Formal story. Marketing links shipped; the manage-account entry waits on `identity-300` (roadmap §4.6, no epic issue yet) and stays here, cross-linked. |
| [#1667](https://github.com/bldrs-ai/Share/issues/1667) open | Reclassified as support work (design-system tokens used across stories); detached from #1657 and linked from its body. `story` label removed. |
| [#1989](https://github.com/bldrs-ai/Share/issues/1989) closed | Reclassified as support work (design-system alignment of the drawer and top bar); detached and linked. |
| [#1992](https://github.com/bldrs-ai/Share/issues/1992) closed | Formal story, retained. Its Notes "New note" change was made in the shell's layout; Notes' own stories link it (#2150). |
| [#1993](https://github.com/bldrs-ai/Share/issues/1993) closed | Formal story, retained. No roadmap epic owns the Apps bar; `assist-320` owns the toolbelt's contents. |
| [#2193](https://github.com/bldrs-ai/Share/issues/2193) open | New formal story, from workspace.md. No existing issue covered it. |
| [#1672](https://github.com/bldrs-ai/Share/issues/1672) open, under #1659 | Not moved. Its "conversations as the third ProjectsDrawer level" is the listing #2193 now owns; its tray and thread stay `assist-310`'s. |

## Applied changes

Titles, all with the `assist-300:` prefix:

| Issue | Before | After |
|---|---|---|
| #1657 | epic: assist-300: Workspace shell — projects drawer + top bar | assist-300: Workspace shell — projects, models and sessions |
| #1661 | story: workspace: ProjectsDrawer container + project→models struct (W1) | assist-300: Group models into projects in the left drawer |
| #1662 | story: workspace: local project persistence (Tier 1) + Auth0 user_metadata sync (Tier 2, logged-in) | assist-300: Keep projects, models and sessions across reloads |
| #1663 | story: workspace: TopBar replaces ToolbarPaper — breadcrumb + search relocate (W2) | assist-300: See where I am in the top bar, and search from it |
| #1664 | story: workspace: OpenModelControl retires from ControlsGroup; open-via-drawer (W3) | assist-300: Open a model on its own |
| #1665 | story: workspace: Profile + Share relocate to TopBar (W4) | assist-300: Reach Profile and Share from the top bar |
| #1666 | story: workspace: logo popup — About/Pricing/News + manage account (screen 4) | assist-300: Reach About, Pricing, News and my account from the logo |
| #1667 | story: workspace: DS icon tokens (…) | assist-300: design-system icon tokens for the workspace (…) |
| #1989 | story: workspace: align shell with the Bldrs Share design system | assist-300: align the workspace shell with the Bldrs Share design system |
| #1992 | story: workspace: side drawers open under the TopBar; Notes leads with New note | assist-300: Side drawers open beneath the top bar, and Notes starts with New note |
| #1993 | story: workspace: Apps bar docks running and pinned apps on the right border | assist-300: Get back to running and pinned apps from the right edge |

Labels: `story` added to #1992 and #1993 (they had none); `story` removed from #1667. Every direct story of #1657 now has `story`, and #1657 has `epic`.

Hierarchy: #2193 created as a sub-issue of #1657. #1667 and #1989 detached from #1657; each got a comment saying so. No other parent changed, and #1659's and #1251's hierarchies were not touched.

Bodies: #1657, #1662, #1664 and #1666 rewritten, each with its original text verbatim in a collapsed "Original description". Closed stories kept their bodies. No state, milestone, assignee or checkbox changed.

Resulting direct sub-issues of #1657, checked after the changes: #1661, #1662, #1663, #1664, #1665, #1666, #1992, #1993, #2193.

## Evidence

Pinned to [5dc1788](https://github.com/bldrs-ai/Share/commit/5dc1788f9825f2938f387ff36b27315073792557); source and test definitions read, no runtime walkthrough or test run claimed.

- Under the flag, Open and Save have left the floating group for the top bar ([ControlsGroup.jsx L32–37](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/src/Containers/ControlsGroup.jsx#L32-L37), [TopBar.jsx](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/src/Containers/TopBar.jsx)). That is #1664's original outcome; whether it is enough to call that part done is left to the owner (#1664's Baseline).
- [ProjectsDrawer.spec.ts](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/src/Containers/ProjectsDrawer.spec.ts) and [TopBar.spec.ts](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/src/Containers/TopBar.spec.ts) run under `describeMobileAndDesktop` and cover the drawer flows, local persistence, the logo menu, the top bar's contents and search from it.
- Gap: [conversational-cad.md §2](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/new/conversational-cad.md#acceptance-playwright) asks for a flag-off screenshot showing today's layout unchanged. No such test was found (#1696 lists it as still open). It belongs with the flag-off layout decision on #1657.

## Decisions left open

Each is recorded in the issue named; this list only points there.

- Flag-off layout beyond "today's production layout, inset" (#1657, product owner).
- Where a session's conversation is kept (#1662, with [workspace-sessions.md](https://github.com/bldrs-ai/Share/blob/5dc1788f9825f2938f387ff36b27315073792557/design/new/workspace-sessions.md)).
- The home model in Ungrouped on a fresh profile, and phones starting collapsed (#2193).
- The manage-account entry's signed-out behaviour (#1666, with `identity-300`).
- Whether #1664's original outcome is complete (#1664).
- #1672's drawer part versus #2193, for the `assist-310` reconciliation.

## Milestone hypothesis

- **Milestone hypothesis:** AI stage AI.1 (post-MVP); grouping work into projects, and sessions within them, brings people back to the same models.
- **Metric:** returning sessions per project within 7 days (workspace.md L130).
- **Test (proposed):** a holdout is acceptable while the shell is behind `?feature=workspace`; otherwise a correlational regression on observed use, controlled for tier, source and prior engagement.
- **Current estimate:** not instrumented yet. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).
