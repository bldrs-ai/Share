# Notes 100 triage

**Status:** Notes issue normalization applied; UX decisions remain draft · 2026-11-12.
**Scope:** Establish and apply the [standard UX rubric](ux-rubric.md), including milestone-to-sub-issue reconciliation.

For the epic's motivation and story summary, see the [Notes 100 snapshot](notes-100.md). This document preserves the reconciliation record; current delivery state and task progress live in the linked issues.

## Notes scope and tier decisions

The four former N17–N20 UX groups are useful requirement groupings, not four replacement issues for all existing Notes work.

The MVP default applies to the agreed basic workflow, not every desired future feature. Keep private local drafts, explicit publication, anchored reading/replies and basic selection/filtering of existing topic tags within the proposed `notes-100` target. Shared taxonomy administration, cross-version carry-forward and frozen discussion snapshots are candidates for separate later scope, not automatic additions to MVP. Their exact epic codes remain unassigned.

Preserve `notes-200` for BCF round-trip and `notes-300` for Drive-backed Notes unless a later roadmap decision explicitly moves them. Preserve their historical aliases; do not recycle those IDs for drafts or tags. Backend work needed to satisfy an MVP audience is a dependency to resolve, not a reason to promise unlisted discussion through public GitHub issues.

## Pilot issue inventory

The [supplied query](https://github.com/bldrs-ai/Share/issues?q=is%3Aissue+notes+label%3Astory+-label%3Abug+%22Notes+100%22) initially returned **10 issues**, with no incomplete-results flag: nine product stories and one UX-planning task. Nine were closed and one open at initial inspection. This is the pre-normalization snapshot; titles and labels have since changed. The query searches body text as well as titles, which is why [#881](https://github.com/bldrs-ai/Share/issues/881) is included.

| Issue and current state | Canonical story / role | UX fit and proposed disposition |
|---|---|---|
| [#1054](https://github.com/bldrs-ai/Share/issues/1054) · closed | `notes-100: Browse notes` | Retain. Former N20 list requirements. Clarify that readers browse accessible notes, not only notes they personally authored; distinguish empty, filtered and unavailable states. |
| [#1055](https://github.com/bldrs-ai/Share/issues/1055) · closed | `notes-100: Open a note and its discussion` | Retain/extend. Former N20 selection and N19 reading. Preserve thread/back navigation and define original-version, anchor and missing-context behavior. |
| [#1056](https://github.com/bldrs-ai/Share/issues/1056) · closed | `notes-100: Open the source GitHub issue` | Retain explicitly. Current UX mentions this mainly as baseline evidence; give the source action acceptance coverage. It is source navigation, not an unlisted Share link. |
| [#1059](https://github.com/bldrs-ai/Share/issues/1059) · closed | `notes-100: Create a note` | Extend + evidence follow-up. Former N17 and the publication part of N19. Separate local draft persistence from publication; verify the actual created note and its exact context. |
| [#978](https://github.com/bldrs-ai/Share/issues/978) · closed | `notes-100: Reply to a note` | Retain/extend + evidence follow-up. Former N19 reply tasks. Verify send, persisted result, attribution, permissions and retry; rendering an input is insufficient. |
| [#1057](https://github.com/bldrs-ai/Share/issues/1057) · open | `notes-100: Edit a note` | Keep open; clarify remaining work and evidence. The current UX treats edit/delete largely as baseline prose. Add explicit save, cancel, permission, persistence and failure obligations before judging completion. |
| [#1058](https://github.com/bldrs-ai/Share/issues/1058) · closed | `notes-100: Delete a note` — existing wording retained pending semantics decision | Clarify + evidence follow-up. The UI says Delete but the GitHub implementation closes the issue. Decide close/archive versus actual deletion and describe what remains accessible; do not claim erasure. |
| [#1071](https://github.com/bldrs-ai/Share/issues/1071) · closed | `notes-100: Share a note link` | Extend + evidence follow-up. Existing path/issue/camera link acceptance must evolve to opaque links, exact-version context and accurate audience disclosure. Sharing owns the shared resolver/access contract. |
| [#1072](https://github.com/bldrs-ai/Share/issues/1072) · closed | `notes-100: Open a shared note` | Retain/extend + verify. Cover recipient model/version, note, replies, anchor, access and missing-content recovery. Replace obsolete test references with current evidence. |
| [#881](https://github.com/bldrs-ai/Share/issues/881) · closed | UX-planning task: finish Notes acceptance tasks | Reclassify in the inventory. Keep its history; it is not a tenth product story. The live issue no longer has the story label; retain its current labels and link it as supporting planning work outside #670's direct sub-issues. |

The four former UX groups do not map one-to-one to these issues:

| Former UX group | Canonical owner | Existing stories / remaining decomposition |
|---|---|---|
| N17 Place a note | `notes-100` | [#1059](https://github.com/bldrs-ai/Share/issues/1059) plus the existing placemark dependency. |
| N18 Save private drafts | `notes-100` | Story issue pending after the broader duplicate search; no matching draft story was found in this pilot cohort. |
| N19 Publish and reply | `notes-100` | Publication [#1059](https://github.com/bldrs-ai/Share/issues/1059), reply [#978](https://github.com/bldrs-ai/Share/issues/978), share [#1071](https://github.com/bldrs-ai/Share/issues/1071), and recipient opening [#1072](https://github.com/bldrs-ai/Share/issues/1072). Keep these independently testable stories. |
| N20 Browse and topic-filter | `notes-100` | Browse [#1054](https://github.com/bldrs-ai/Share/issues/1054), open [#1055](https://github.com/bldrs-ai/Share/issues/1055); basic tag selection/filtering needs a duplicate search and a separately tracked story if absent. |
| Existing actions not explicit in N17–N20 | `notes-100` | Source navigation [#1056](https://github.com/bldrs-ai/Share/issues/1056), note edit [#1057](https://github.com/bldrs-ai/Share/issues/1057), note removal [#1058](https://github.com/bldrs-ai/Share/issues/1058), and the adjacent comment mutation stories below. |

## Source and acceptance findings

Source snapshot: [`13de4ee`](https://github.com/bldrs-ai/Share/commit/13de4ee96d142daba3335b69453d431a0e1e0c55). These are source/test-definition findings; no runtime walkthrough or test execution is claimed.

- [Notes.spec.ts](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/Notes.spec.ts) exercises list visibility, selected title/comments and return navigation, corresponding to #1054/#1055.
- [Note.spec.ts](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/Note.spec.ts) has a skipped create-result test for #1059. Its deletion test invokes the action but leaves note disappearance as a TODO. Its sharing test checks the snackbar, not the clipboard value or recipient round trip. These are specific evidence gaps, not proof the runtime features are absent.
- [Comment.spec.ts](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/Comment.spec.ts) covers composer visibility and typing, but does not establish submission and a persisted reply for #978. A comment describing migrated shared-note tests is not itself recipient-opening coverage.
- [NoteCard.jsx](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/Components/Notes/NoteCard.jsx) calls `closeIssue` for note removal, while [Issues.js](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/src/net/github/Issues.js) writes `state: 'closed'`. Closing preserves the upstream issue; deleting a comment uses a different operation.
- The inspected list/note/comment specs do not use `describeMobileAndDesktop`; the [Playwright configuration](https://github.com/bldrs-ai/Share/blob/13de4ee96d142daba3335b69453d431a0e1e0c55/tools/playwright.config.js) shown in this snapshot uses Desktop Chrome. Verify desktop/mobile coverage explicitly instead of inferring it from an existing spec filename.
- #1057’s [comment](https://github.com/bldrs-ai/Share/issues/1057#issuecomment-2081115116) records an AuthProxy test blocker. #1059’s [comment](https://github.com/bldrs-ai/Share/issues/1059#issuecomment-2081115360) links PR #1148 as setup work. These explain the history; they do not establish that the current blocker persists.

## Milestone audit and applied hierarchy

The wider search found the original Notes tracker [#670](https://github.com/bldrs-ai/Share/issues/670), previously closed with an empty body and the `Tracking` label. It is now `notes-100: Anchored notes`, labeled `epic` while retaining `Tracking`, and reopened as an aggregate because existing children remain open. No duplicate epic was created.

The [shared normalization procedure](ux-rubric.md#issue-normalization-including-milestones) makes this audit part of every feature reconciliation. All twelve Notes milestones were inspected across both issue states, plus the broader release milestone 59 containing related Notes bugs. Each returned fewer than 100 members; no result page was omitted. Pull requests are evidence, not sub-issues. Explicit links also brought in #911, which has no milestone. #881 was included from the original pilot; its general cleanup milestone 60 was retained without expanding unrelated cleanup work.

The applied hierarchy contains **35 native parent/child links across 36 existing issues**: 11 formal UX stories directly under #670, 19 children of those stories, and 5 historical tasks beneath the legacy edit story #891. All selected children had no parent at preflight. Existing story/bug/task states, bodies and checkboxes were preserved; only the aggregate #670 was reopened. The eleven current story titles now share `notes-100:`; #881's planning title uses the same prefix. #1186/#1187 gained `story` while retaining `enhancement`; all other existing labels were retained.

### Milestone disposition crosswalk

“Under #N” means native sub-issues of that issue. Every milestone and issue assignment remains unchanged.

| Historical milestone | Issue disposition | PR evidence |
|---|---|---|
| [Notes 100: Misc · 13](https://github.com/bldrs-ai/Share/milestone/13) | Under [#1059](https://github.com/bldrs-ai/Share/issues/1059): [#919](https://github.com/bldrs-ai/Share/issues/919). Under [#1055](https://github.com/bldrs-ai/Share/issues/1055): [#1063](https://github.com/bldrs-ai/Share/issues/1063), [#684](https://github.com/bldrs-ai/Share/issues/684), [#317](https://github.com/bldrs-ai/Share/issues/317). Under [#1057](https://github.com/bldrs-ai/Share/issues/1057): [#972](https://github.com/bldrs-ai/Share/issues/972), [#891](https://github.com/bldrs-ai/Share/issues/891). Under legacy [#891](https://github.com/bldrs-ai/Share/issues/891): [#908](https://github.com/bldrs-ai/Share/issues/908), [#909](https://github.com/bldrs-ai/Share/issues/909), [#910](https://github.com/bldrs-ai/Share/issues/910), [#912](https://github.com/bldrs-ai/Share/issues/912), plus explicitly linked [#911](https://github.com/bldrs-ai/Share/issues/911) outside the milestone. Linked cross-story support, outside the epic's direct sub-issues: [#1008](https://github.com/bldrs-ai/Share/issues/1008), [#983](https://github.com/bldrs-ai/Share/issues/983), [#947](https://github.com/bldrs-ai/Share/issues/947), [#946](https://github.com/bldrs-ai/Share/issues/946), [#285](https://github.com/bldrs-ai/Share/issues/285). Defer [#998](https://github.com/bldrs-ai/Share/issues/998), [#309](https://github.com/bldrs-ai/Share/issues/309), [#311](https://github.com/bldrs-ai/Share/issues/311), [#319](https://github.com/bldrs-ai/Share/issues/319) as below. | [#1253](https://github.com/bldrs-ai/Share/pull/1253), [#954](https://github.com/bldrs-ai/Share/pull/954), [#915](https://github.com/bldrs-ai/Share/pull/915) |
| [Notes 100: Access notes list · 36](https://github.com/bldrs-ai/Share/milestone/36) | Story [#1054](https://github.com/bldrs-ai/Share/issues/1054) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1291](https://github.com/bldrs-ai/Share/issues/1291), [#1073](https://github.com/bldrs-ai/Share/issues/1073) under [#1054](https://github.com/bldrs-ai/Share/issues/1054). Screenshot/test work [#1216](https://github.com/bldrs-ai/Share/issues/1216) remains a linked support reference outside the epic's direct sub-issues. | [#1225](https://github.com/bldrs-ai/Share/pull/1225), [#1148](https://github.com/bldrs-ai/Share/pull/1148), [#1118](https://github.com/bldrs-ai/Share/pull/1118), [#1102](https://github.com/bldrs-ai/Share/pull/1102), [#1086](https://github.com/bldrs-ai/Share/pull/1086), [#1079](https://github.com/bldrs-ai/Share/pull/1079), [#1067](https://github.com/bldrs-ai/Share/pull/1067), [#984](https://github.com/bldrs-ai/Share/pull/984) |
| [Notes 100: Note Contains link to Github issue · 37](https://github.com/bldrs-ai/Share/milestone/37) | Story [#1056](https://github.com/bldrs-ai/Share/issues/1056) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1089](https://github.com/bldrs-ai/Share/pull/1089), [#1085](https://github.com/bldrs-ai/Share/pull/1085) |
| [Notes 100: Create a Note · 38](https://github.com/bldrs-ai/Share/milestone/38) | Story [#1059](https://github.com/bldrs-ai/Share/issues/1059) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1202](https://github.com/bldrs-ai/Share/issues/1202), [#1185](https://github.com/bldrs-ai/Share/issues/1185) under [#1059](https://github.com/bldrs-ai/Share/issues/1059). | [#1184](https://github.com/bldrs-ai/Share/pull/1184), [#1163](https://github.com/bldrs-ai/Share/pull/1163) |
| [Notes 100: Edit a note · 39](https://github.com/bldrs-ai/Share/milestone/39) | Story [#1057](https://github.com/bldrs-ai/Share/issues/1057) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1150](https://github.com/bldrs-ai/Share/pull/1150) |
| [Notes 100: Delete a note · 40](https://github.com/bldrs-ai/Share/milestone/40) | Story [#1058](https://github.com/bldrs-ai/Share/issues/1058) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1200](https://github.com/bldrs-ai/Share/issues/1200) under [#1058](https://github.com/bldrs-ai/Share/issues/1058). Misfiled edited-state bug [#1201](https://github.com/bldrs-ai/Share/issues/1201) under [#1057](https://github.com/bldrs-ai/Share/issues/1057); retain its Delete milestone. | [#1169](https://github.com/bldrs-ai/Share/pull/1169) |
| [Notes 100: Select a note · 41](https://github.com/bldrs-ai/Share/milestone/41) | Story [#1055](https://github.com/bldrs-ai/Share/issues/1055) under [#670](https://github.com/bldrs-ai/Share/issues/670). | [#1088](https://github.com/bldrs-ai/Share/pull/1088), [#1081](https://github.com/bldrs-ai/Share/pull/1081) |
| [Notes 100: Comments on Notes · 43](https://github.com/bldrs-ai/Share/milestone/43) | Independent stories [#978](https://github.com/bldrs-ai/Share/issues/978), [#1186](https://github.com/bldrs-ai/Share/issues/1186), [#1187](https://github.com/bldrs-ai/Share/issues/1187) are siblings under [#670](https://github.com/bldrs-ai/Share/issues/670); comment mutation is not made a child of reply merely because they share a milestone. | [#1196](https://github.com/bldrs-ai/Share/pull/1196), [#1191](https://github.com/bldrs-ai/Share/pull/1191), [#1170](https://github.com/bldrs-ai/Share/pull/1170), [#974](https://github.com/bldrs-ai/Share/pull/974), [#970](https://github.com/bldrs-ai/Share/pull/970) |
| [Notes 100: Share a note · 44](https://github.com/bldrs-ai/Share/milestone/44) | Story [#1071](https://github.com/bldrs-ai/Share/issues/1071) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1101](https://github.com/bldrs-ai/Share/issues/1101) under [#1071](https://github.com/bldrs-ai/Share/issues/1071). | [#1115](https://github.com/bldrs-ai/Share/pull/1115), [#1090](https://github.com/bldrs-ai/Share/pull/1090) |
| [Notes 100:  Access shared Note · 45](https://github.com/bldrs-ai/Share/milestone/45) | Story [#1072](https://github.com/bldrs-ai/Share/issues/1072) under [#670](https://github.com/bldrs-ai/Share/issues/670); [#1096](https://github.com/bldrs-ai/Share/issues/1096) under [#1072](https://github.com/bldrs-ai/Share/issues/1072). Model-switch navigation bug [#1181](https://github.com/bldrs-ai/Share/issues/1181) under [#1055](https://github.com/bldrs-ai/Share/issues/1055) based on its content. | [#1119](https://github.com/bldrs-ai/Share/pull/1119), [#1114](https://github.com/bldrs-ai/Share/pull/1114), [#1093](https://github.com/bldrs-ai/Share/pull/1093) |
| [Notes 200: Anchor a note to an element · 34](https://github.com/bldrs-ai/Share/milestone/34) | Defer anchoring family [#892](https://github.com/bldrs-ai/Share/issues/892), [#928](https://github.com/bldrs-ai/Share/issues/928), [#929](https://github.com/bldrs-ai/Share/issues/929), [#930](https://github.com/bldrs-ai/Share/issues/930), [#931](https://github.com/bldrs-ai/Share/issues/931), [#932](https://github.com/bldrs-ai/Share/issues/932), [#985](https://github.com/bldrs-ai/Share/issues/985) pending reconciliation with `view-230`; preserve historical Notes 200 alias. | [#988](https://github.com/bldrs-ai/Share/pull/988) |
| [Notes 200: Research existing Placemark code · 42](https://github.com/bldrs-ai/Share/milestone/42) | Defer [#942](https://github.com/bldrs-ai/Share/issues/942), [#599](https://github.com/bldrs-ai/Share/issues/599) with placemark ownership reconciliation. | [#1263](https://github.com/bldrs-ai/Share/pull/1263) |
| [2024-08-05 · 59](https://github.com/bldrs-ai/Share/milestone/59) | Notes loading/list bugs [#1244](https://github.com/bldrs-ai/Share/issues/1244), [#1245](https://github.com/bldrs-ai/Share/issues/1245), [#1135](https://github.com/bldrs-ai/Share/issues/1135) under [#1054](https://github.com/bldrs-ai/Share/issues/1054); private-image display bug [#1246](https://github.com/bldrs-ai/Share/issues/1246) under [#1055](https://github.com/bldrs-ai/Share/issues/1055). Seven unrelated members remain outside this pilot. | Unrelated to this Notes mapping |

**Pilot correction: an epic's direct sub-issues are formal UX stories only.** The initial normalization incorrectly attached planning/support work directly to #670. The user removed #1216, #1008, #983, #947, #946 and #285; #881 was also detached to apply the same rule to the planning task. Keep these seven issues as linked supporting references, preserving their labels, scope, state and milestones. Do not reattach them to the epic, relabel them as stories, or manufacture UX stories merely to populate the hierarchy. Where support work has a clear story owner, link it beneath that story; otherwise retain the crosswalk reference until ownership is resolved. [#891](https://github.com/bldrs-ai/Share/issues/891) remains a closed legacy edit record under the current edit story [#1057](https://github.com/bldrs-ai/Share/issues/1057), retaining its explicitly linked task family rather than deleting or duplicating that history.

### Deferred ownership and scope

These 13 issues remain outside this pilot's new links; the milestone audit is complete for the enumerated sources, but ownership reconciliation is not:

| Issues | Reason and next decision |
|---|---|
| [#998](https://github.com/bldrs-ai/Share/issues/998) | Shared deselection infrastructure spans View, Search and Notes. Select the primary owning story/epic, then link the other dependencies. |
| [#309](https://github.com/bldrs-ai/Share/issues/309), [#311](https://github.com/bldrs-ai/Share/issues/311), [#319](https://github.com/bldrs-ai/Share/issues/319) | Image sizing, custom note ordering and footer visibility require a core-UX versus later-customization scope decision before assigning a tier/parent. |
| [#892](https://github.com/bldrs-ai/Share/issues/892), [#928](https://github.com/bldrs-ai/Share/issues/928), [#929](https://github.com/bldrs-ai/Share/issues/929), [#930](https://github.com/bldrs-ai/Share/issues/930), [#931](https://github.com/bldrs-ai/Share/issues/931), [#932](https://github.com/bldrs-ai/Share/issues/932), [#985](https://github.com/bldrs-ai/Share/issues/985) | Existing element-anchoring family. Reconcile the roadmap's `view-230` ownership and historical Notes 200 aliases before assigning native parents; historical “Notes 200” does not mean current `notes-200` BCF. |
| [#942](https://github.com/bldrs-ai/Share/issues/942), [#599](https://github.com/bldrs-ai/Share/issues/599) | Existing placemark research and tracker. Resolve their relationship to anchoring and avoid creating a duplicate parent. |

No new draft/tag story was created during structural normalization. Search and agree the remaining requirement delta before opening follow-ups. This is also not a complete inventory of every Notes-related issue in the repository.

### Verification

The initial 42-link pass was checked against the preflight snapshot for preserved milestone assignments, assignees, child bodies/checklists and child states/state reasons. After the UX-story-only correction, verify the 35 retained links and the eleven direct story children; the seven supporting issues must remain outside the epic's direct children. Label changes were limited to adding `epic` to #670 and `story` to #1186/#1187. Milestone metadata was not edited. These checks validate issue organization, not runtime UX acceptance.

## Remaining decisions and acceptance work

- [x] Adopt the existing #670 tracker as the canonical epic, normalize current story titles, include #1186/#1187 as stories, and preserve #881 as linked planning work outside the epic's direct sub-issues.
- [x] Expand through related milestones, apply the unambiguous native hierarchy, and retain milestone metadata and assignments for reference.
- [ ] Resolve the deferred ownership/scope rows above and link their eventual owners without using milestone membership as the work hierarchy.
- [ ] Confirm close/archive versus delete semantics for notes, including labels, source access, old links and recovery.
- [ ] Confirm the basic Notes MVP boundary, including private drafts and basic topic filtering; separate later administration/carry-forward scope.
- [ ] Agree precise follow-up acceptance for create, reply, removal and share/open; preserve historical completion while recording the current gaps.
- [ ] Reconcile roadmap status from verified UX evidence, then repeat this rubric for Sharing and Versions.

The roadmap's current `notes-100` done marker describes the existing baseline; it does not establish completion of the expanded target UX or all related bugs. Other roadmap epic assignments remain unchanged. Native sub-issue rollups track issue state, not acceptance verification.


## Requirements migration to issues · 2026-11-12

The working `notes.md` draft has been retired after assigning its requirements to live issues. [Source snapshot](https://github.com/bldrs-ai/Share/blob/8ab4ae9358ad3dcab25f250c40da7f700bd03508/design/reqs/notes.md) preserves the full original text. The [Notes 100 one-page snapshot](notes-100.md) remains the dated eleven-story account approved before this migration; it is not a live backlog. This section records the transfer, not changing delivery status.

### Ownership crosswalk

Task ordinals below refer only to the checklist order in the linked source snapshot; they are migration locators, not new UX codes. All 26 story tasks and three cross-feature audit tasks have issue owners. Acceptance and dependency prose moved with the owning tasks; shared contracts and decision ownership are on #670.

| Source requirement | Live owner |
|---|---|
| Epic motivation, end-to-end journey, lifecycle states, shared version/audience/permission rules | [#670](https://github.com/bldrs-ai/Share/issues/670) |
| Place a note · tasks 1–6, acceptance and dependencies | [#2149](https://github.com/bldrs-ai/Share/issues/2149) |
| Private drafts · tasks 1–6, acceptance and persistence decisions | [#2148](https://github.com/bldrs-ai/Share/issues/2148) |
| Publish/reply · tasks 1–4: publication review, consent, permission and retry | [#2149](https://github.com/bldrs-ai/Share/issues/2149) |
| Publish/reply · task 5: opaque scoped note link | [#2155](https://github.com/bldrs-ai/Share/issues/2155) |
| Publish/reply · task 6: attributed replies and recoverable sends | [#2154](https://github.com/bldrs-ai/Share/issues/2154) |
| Publish/reply · task 7: anonymous reading, live refresh and pinned model | [#2156](https://github.com/bldrs-ai/Share/issues/2156) |
| Browse/tags · tasks 1–2 and 5: list/marker association, identity, state and empty/unavailable cases | [#2150](https://github.com/bldrs-ai/Share/issues/2150) |
| Browse/tags · tasks 3–5: tag selection, consistent filters and untagged/empty cases | [#894](https://github.com/bldrs-ai/Share/issues/894) |
| Browse/tags · tasks 6–7: old-version navigation and missing anchors | [#2151](https://github.com/bldrs-ai/Share/issues/2151) |
| Source navigation and its acceptance/access audit | [#2152](https://github.com/bldrs-ai/Share/issues/2152), following #1056 |
| Note edits, comment edits/deletion and their permission/recovery audit | [#1057](https://github.com/bldrs-ai/Share/issues/1057), [#1186](https://github.com/bldrs-ai/Share/issues/1186), [#1187](https://github.com/bldrs-ai/Share/issues/1187) |
| Note removal semantics, retained source/links and recovery | [#2153](https://github.com/bldrs-ai/Share/issues/2153), following #1058 |
| Discussion-history and cross-version decisions | [#2151](https://github.com/bldrs-ai/Share/issues/2151) |
| Taxonomy, initial tags, label mapping and administration scope | [#894](https://github.com/bldrs-ai/Share/issues/894) |
| External-input destination/fallback and contribution-permission decisions | [#2149](https://github.com/bldrs-ai/Share/issues/2149), coordinated by #670 |
| Cross-feature dependencies, BCF/Drive/anchoring ownership, six gap-analysis areas and final three audit tasks | [#670](https://github.com/bldrs-ai/Share/issues/670), with the story owners above |

### Existing stories and follow-ups

Eight completed baseline stories retain their original bodies/checklists and states, with appended links to their expanded follow-ups: #1059 → #2149, #1054 → #2150, #1055 → #2151, #1056 → #2152, #1058 → #2153, #978 → #2154, #1071 → #2155 and #1072 → #2156. Open stories #1057, #1186 and #1187 gained explicit acceptance, failure/recovery and permission obligations without changing historical checkboxes.

The duplicate search covered open and closed Notes titles plus draft/topic/label/tag queries, with complete single-page search results. It found no existing focused private-draft story. #357 includes local/online issues as part of BCF interchange; new #2148 owns basic private Share drafting and links that related scope. #599 covers placemark creation and optional tag color; #311 covers ordering, neither owns durable drafts or full topic filtering.

Existing open #894 (historical `Story: Epic: Collab (200) - Issues`) was reused as `notes-100: Find model notes using colored topic tags`. Its original description and Collab milestone 64 remain. Basic topic filtering belongs to the agreed MVP workflow; the historical title does not redefine current notes-200 BCF. Milestone 64 was inspected: #895 (Code Review) and #896 (Pluggable Note backends) remain outside this Notes hierarchy and keep their ownership. Publication/destination work must coordinate with provider capabilities rather than silently absorbing them.

The nine new stories and reused #894 are direct formal UX sub-issues of #670. Supporting planning/refactor/test issues remain outside the epic's direct children. No existing issue state, milestone, assignee, label or historical task checkbox was changed by this requirements migration; #894's title was normalized. Current task state and product decisions belong in the issues, not this audit record.

### Archived starting gap analysis

The following source/test observations are retained as migration evidence. They are not a fresh runtime audit; the live issues above own follow-up verification.

**Gap analysis status:** Initial observations are based on source and test definitions reviewed on GitHub `main` on 2026-11-11. Live UX walkthroughs, an exact build/commit and full issue reconciliation remain pending. An unverified capability is not necessarily missing. Use Retain, Extend/change, Verify and Decide dispositions, as defined in the index.

| Area / requirements | Existing evidence | Provisional gap or disposition | Next audit step |
|---|---|---|---|
| Browse a note, replies and model context — notes-100 placement, notes-100 discussion and browsing | `Notes` lists/selects notes, loads GitHub comments and parses placemarks; Notes test definitions cover the list, selected thread and return navigation. `NoteFooter` exposes camera and GitHub navigation. | **Retain + verify.** Anchored discussion and replies already exist. The target must account for those flows and thread identities. | Walk through list → marker → note → reply → saved view on desktop/mobile, including anonymous reading and permitted contribution. |
| New → Draft → Published — notes-100 authoring and discussion, V11 | `NoteCardCreate` sends issue/comment creation to GitHub. The inspected path does not establish durable private drafts, reload recovery or account-scoped draft storage. | **Verify, then extend.** Private device-local drafts and honest save/publish states need explicit coverage; model publication must not send drafts. | Inspect current storage; test reload/offline, account switching, cache clearing, failed publication and retry without duplicate notes/replies. |
| Exact model version and legacy anchors — V02, S08, V09, notes-100 | Current Notes uses model routes, note/comment identifiers and parsed placemark URLs. This review has not established immutable revision coverage for every existing note. | **Verify + decide.** Preserve established associations where valid. A legacy note without a verifiable revision must show uncertainty rather than acquire an invented version. | Audit old note links, moving-branch links, external files and source/GLB anchors; specify missing-anchor recovery and any migration or intentional breaking change. |
| Existing edit/delete actions — notes-100 discussion and shared requirements | `NoteMenu` exposes Edit/Delete; `NoteFooter` has edit save/cancel controls. | **Retain or explicitly change.** These actions are part of the baseline, not wholly new decisions. Permissions and effects on published threads need review. | Verify author/non-author controls, server enforcement, cancellation, deleted content and old links; document any revised behavior. |
| Colored topic tags and filtering — notes-100 browsing and tags | Tag taxonomy, label mapping and coordinated list/marker filtering were not established by the inspected components. | **Verify + decide.** Audit current GitHub labels and any existing filters before defining extensions. | Inventory current labels; decide shared taxonomy/permissions and multi-tag matching, then check untagged/empty states and accessible colors. |
| Audience, notes destination and source access — S05, S07–S08, notes-100 discussion | Creation/replies use GitHub issues/comments, and existing controls open those upstream resources. Public issues are publicly discoverable at source. | **Extend/change + decide.** Opaque Share links do not make public issues unlisted. Separate model-read, model-write and notes permissions; choose an audience-compatible destination. | Test public, restricted and issues-disabled sources; verify disclosures, destination selection, signed-out reading and failure recovery without model republication. |

Notes starting points: [Notes](https://github.com/bldrs-ai/Share/blob/main/src/Components/Notes/Notes.jsx), [NoteCardCreate](https://github.com/bldrs-ai/Share/blob/main/src/Components/Notes/NoteCardCreate.jsx), [NoteFooter](https://github.com/bldrs-ai/Share/blob/main/src/Components/Notes/NoteFooter.jsx), [NoteMenu](https://github.com/bldrs-ai/Share/blob/main/src/Components/Notes/NoteMenu.jsx), and [Notes test definitions](https://github.com/bldrs-ai/Share/blob/main/src/Components/Notes/Notes.spec.ts). These links track `main`; pin evidence to the audited commit when completing the analysis.
