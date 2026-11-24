# Versions 100 triage

**Reconciliation date:** 2026-11-12. **Source/technical evidence commit:** `4458ceb1fadfdc8a04f04d172c63f0c63c3d777c` (fresh remote main). **Result:** requirements migrated and hierarchy normalized; runtime acceptance and product decisions remain open in issues.

The [Versions scope snapshot](versions-100.md) is the dated motivation and formal-story account. This record preserves the audit and ownership decisions. Current tasks, progress and acceptance decisions live in [versions-100 #57](https://github.com/bldrs-ai/Share/issues/57), its stories and the existing [share-200 #2144](https://github.com/bldrs-ai/Share/issues/2144) semantic owner. The [shared rubric](ux-rubric.md) governs reconciliation; the [UX index](README.md) owns common requirements.

## Scope, business tier and historical aliases

Reuse the existing open GitHub Version Control tracker #57 as `versions-100: Exact model versions and local history`; do not create a replacement epic. Its original tracker description and all eleven comments remain. The basic journey covers external-source opening, exact identity, explicit local retention, history, replacement, deliberate updates and recovery. Opening exact revisions is the shipped baseline. Whether the new retention stories (#2157–#2160) are MVP is a milestone hypothesis, not a decision made here: measuring Versions use is planned in bizdev#366, and until there's an estimate the roadmap owner decides (`ux-rubric.md` §"Milestones are hypotheses"). Roadmap §6.0 is unchanged. Existing GitHub-save, revision-navigation and drop-file journeys remain baseline stories, with completed work preserved. This is UX ownership reconciliation, not evidence that the expanded target has shipped.

Keep the existing roadmap assignments distinct:

| Canonical epic | Historical meaning and reconciliation |
|---|---|
| `versions-100` · #57 | Existing GitHub Version Control / Versions 100. Extend the basic user journey with local retention and recoverability; retain existing story identities. |
| `versions-300` | Structural version diff; historical roadmap aliases `versions-110` and `versions-200`. Do not claim that a structural diff implements semantic merge. No duplicate epic/story was opened by this pass. |
| `versions-310` · Track T6 | Portable versions for Drive; historical roadmap aliases `versions-120` and `versions-210`. Browser-local retention and local-git input are separate capabilities, not renames of this epic. |
| Existing `share-200` · #2144 | Model versioning/sharing proposal and its later semantic phases. Retain the existing code and owner; V13–V16 now have four formal stories here. See the [scope slice](share-200.md) and [triage slice](share-200-triage.md). |

**Historical label collision:** #890's title and milestone called deletion “Versions 200”. Its body does not describe branch navigation or structural diff. Normalize this basic retention/deletion story to `versions-100: Delete a version`, preserving milestone 24 and all 35 original checkbox lines. This is an explicit content-based scope reconciliation, not a global substitution of the `versions-200` alias. The roadmap's former navigation reference to #890 is corrected. Its pasted Notes-edit checklist remains historical text; Notes editing stays owned by #1057. Deletion effects remain a decision: local-copy removal, entry removal, hiding and remote deletion cannot be treated as equivalent or silently destroy pinned history.

The historical milestone “Versions 300: Create BLD project” is a different .bld project-serialization initiative, not the modern structural-diff epic. Preserve its eight members and defer their current project/workspace ownership rather than attach them to Versions by name alone.

## Inventory method and limits

The original discovery searched titles and bodies across all open/closed repository records for `Versions 100/110/120/200/210/300/310`, `versions-<code>`, version/history/portable phrases and explicit references to #57/#850/#887/#890/#980/#934. A local full REST inventory of `GET /repos/bldrs-ai/Share/issues?state=all&per_page=100` returned **2,079 issue/PR records across 21 pages** on 2026-11-12; all pages were consumed. The complete milestone inventory returned **49 milestones**, including open and closed states. This avoids story-label search omissions; labels alone do not establish product-story ownership.

All members of Versions milestones **5, 12, 24, 50 and 53** were read: **48 records, comprising 37 issues and 11 PRs**. Broader backlog milestone **63** was fully enumerated: **24 issues**, with #57 selected and 23 unrelated members retained outside this reconciliation. Explicit links, runtime-source test references and title matches expanded the read to **84 existing issue/PR bodies (68 issues and 16 PRs) and their complete paginated top-level comments**. PRs are evidence and are never native sub-issues. This is an issue-conversation audit; it does not claim all PR inline reviews were reread.

Before mutation, each selected issue's native parent was queried. #57/#2144 had zero direct sub-issues. All 27 newly attached child issues had no parent. Existing shell-placement issue #1670 already belonged to #1658 and retains that relationship. No conflicting parent was overwritten. Milestones, labels, assignees and states were captured before edits for preservation checks. Repository-wide unrelated issues were not read as product evidence merely because they appeared in the inventory.

## Existing UX stories and dispositions

| Existing issue / state at inspection | User outcome and applied disposition |
|---|---|
| [#850](https://github.com/bldrs-ai/Share/issues/850) · open | **Extend.** Existing specific-version navigation owner; retains its checked #848 reference and unchecked file-filter task. Owns complete external-source V21 target, immutable identity, permissions and recovery. |
| [#1154](https://github.com/bldrs-ai/Share/issues/1154) · closed | **Retain + evidence follow-up.** Original selected-GitHub-version story and completed checkbox preserved. Expanded opening/history/update acceptance links to #850/#2158/#2159; do not reopen or claim its old screenshots verify new scope. |
| [#887](https://github.com/bldrs-ai/Share/issues/887) · open | **Extend.** Existing GitHub-destination save flow; preserve eleven original checklist lines. Distinct from first local retention. Add actual destination permission, explicit publication, persisted result, interruption/race recovery and truthful states. |
| [#980](https://github.com/bldrs-ai/Share/issues/980) · closed | **Retain + follow-up.** Original repository/folder save acceptance and three completed checkboxes preserved. Current GitHub-save work stays in matching open #887; local save belongs to #2157. |
| [#1160](https://github.com/bldrs-ai/Share/issues/1160) · closed | **Retain + evidence follow-up.** Whole-file GitHub overwrite, not semantic model editing. Preserve the original unchecked task despite closed state; link current #887/#950 acceptance. |
| [#934](https://github.com/bldrs-ai/Share/issues/934) · closed | **Retain + clarify.** Existing drop-file update/open story had no body; add its user goal and link the comment-identified overlap #950, without inventing historical checked acceptance. |
| [#950](https://github.com/bldrs-ai/Share/issues/950) · open | **Extend and reuse.** Existing changed-file update versus new-model story matches V03. Add `story` while retaining `enhancement`, preserve original prose, and migrate full replacement/import/provenance/Notes target. Its old mutable-URL wording requires an explicit migration decision, not silent retargeting of exact links. |
| [#890](https://github.com/bldrs-ai/Share/issues/890) · open | **Clarify.** Existing delete user goal stays formal; preserve original body/checklists and milestone. Current delete semantics, authorization, last/current-version behavior and recovery remain explicitly open. |
| [#982](https://github.com/bldrs-ai/Share/issues/982) · open | **Reclassify in the inventory.** Cross-story save/delete UI implementation, despite historical `story` label. Its comment says components are complete but wiring awaited a refactor. Preserve labels/state; link as support outside direct epic children. |
| [#1002](https://github.com/bldrs-ai/Share/issues/1002) · closed | **Reclassify in the inventory.** Shortcut grooming/documentation, with original unchecked planning tasks. Supporting reference only. |

No additional matching local first-save, mixed-origin history, deliberate-update, usable-backup or semantic goal was found in the full duplicate search. Create only those missing user stories: #2157–#2160 and #2161–#2164. Do not create a replacement for #950 or transform GitHub publication #887 into local save.

## Milestone and supporting-issue crosswalk

Every milestone name, description, due date, open/closed state and issue/PR assignment is preserved. The table gives the captured source member and applied owner/disposition; a native issue-state rollup is not UX verification.

### Versions 300: Create BLD project · milestone 5

[Historical milestone](https://github.com/bldrs-ai/Share/milestone/5) · 8 members at inspection.

| Source member and captured state | Applied owner / disposition |
|---|---|
| [issue #735](https://github.com/bldrs-ai/Share/issues/735) · open · Click a button to create a new project | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #736](https://github.com/bldrs-ai/Share/issues/736) · open · UX: Set new project name, choose repo location | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #737](https://github.com/bldrs-ai/Share/issues/737) · open · UX: Show New Project | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #738](https://github.com/bldrs-ai/Share/issues/738) · open · Add API method to create new project | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #739](https://github.com/bldrs-ai/Share/issues/739) · open · Introduce prototype feature flag  | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #740](https://github.com/bldrs-ai/Share/issues/740) · closed · Create a serialized format for .bld   | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #741](https://github.com/bldrs-ai/Share/issues/741) · closed · Save serialized project to GitHub  | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |
| [issue #742](https://github.com/bldrs-ai/Share/issues/742) · open · Support .bld extension in Share URL paths | Distinct .bld project initiative; defer current workspace/project owner; preserve existing relationships. |

### Versions 100: Save imported model · milestone 12

[Historical milestone](https://github.com/bldrs-ai/Share/milestone/12) · 33 members at inspection.

| Source member and captured state | Applied owner / disposition |
|---|---|
| [PR #630](https://github.com/bldrs-ai/Share/pull/630) · closed · Allow page refresh for private models | Linked PR evidence only; retain milestone. |
| [issue #887](https://github.com/bldrs-ai/Share/issues/887) · open · Versions 100: Save imported model (new flow pending new UI component) | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [issue #888](https://github.com/bldrs-ai/Share/issues/888) · closed · Save New Version (dupe) | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [issue #903](https://github.com/bldrs-ai/Share/issues/903) · closed · Research Github Login Flow | Provider-login research supporting save and Connections; linked support, outside direct children. |
| [issue #904](https://github.com/bldrs-ai/Share/issues/904) · closed · Implement UI Component for Save  | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [issue #905](https://github.com/bldrs-ai/Share/issues/905) · closed · Implement Save UI Button | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [issue #906](https://github.com/bldrs-ai/Share/issues/906) · closed · Implement Github Functionality (Browse Repo + Commit Push) | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [issue #907](https://github.com/bldrs-ai/Share/issues/907) · closed · Implement UI saving notification  | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [issue #918](https://github.com/bldrs-ai/Share/issues/918) · closed · Research OPFS for model storage | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #921](https://github.com/bldrs-ai/Share/issues/921) · closed · Save local opened file to OPFS | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #922](https://github.com/bldrs-ai/Share/issues/922) · closed · Use local OPFS-saved file for handle to IFCLoader. | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #923](https://github.com/bldrs-ai/Share/issues/923) · closed · Download IFC URL for save to OPFS and then open as normal | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #924](https://github.com/bldrs-ai/Share/issues/924) · closed · Research OPFS file storage structure and metadata | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #934](https://github.com/bldrs-ai/Share/issues/934) · closed · DnD to initiate file update for new version or open | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [issue #950](https://github.com/bldrs-ai/Share/issues/950) · open · DnD should prompt user for overwrite vs new | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [issue #980](https://github.com/bldrs-ai/Share/issues/980) · closed · Versions 100: Save model | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [issue #981](https://github.com/bldrs-ai/Share/issues/981) · closed · Research into Sparse Checkouts | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #982](https://github.com/bldrs-ai/Share/issues/982) · open · Save + Delete UI components | Cross-story save/delete UI components; linked support, outside direct children; historical story label retained. |
| [PR #989](https://github.com/bldrs-ai/Share/pull/989) · closed · Auth0 End To End Cypress Tests + screenshot / video generation for failed tests | Linked PR evidence only; retain milestone. |
| [issue #1000](https://github.com/bldrs-ai/Share/issues/1000) · closed · Research authentication for isomorphic-git | Cross-story storage/transport research or cache support; linked from epic, outside direct children. Not proof of durable local history. |
| [issue #1023](https://github.com/bldrs-ai/Share/issues/1023) · open · Saving new version doesn't put new timeline entry at top of stack | Native child of [#2158](https://github.com/bldrs-ai/Share/issues/2158); existing implementation/bug/test evidence beneath its story. |
| [PR #1069](https://github.com/bldrs-ai/Share/pull/1069) · closed · Cypress Auth0 Login Mock + Save E2E Tests | Linked PR evidence only; retain milestone. |
| [issue #1074](https://github.com/bldrs-ai/Share/issues/1074) · closed · Save broken post-refactor | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [issue #1075](https://github.com/bldrs-ai/Share/issues/1075) · open · OPFS: save commit for reuse | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [PR #1076](https://github.com/bldrs-ai/Share/pull/1076) · closed · 1074-save-broken-post-refactor | Linked PR evidence only; retain milestone. |
| [issue #1082](https://github.com/bldrs-ai/Share/issues/1082) · closed · OPFS -> Opfs rename breaks model loading | Generic loader/OPFS-rename incident; linked support, outside direct children. |
| [PR #1083](https://github.com/bldrs-ai/Share/pull/1083) · closed · 1074 revert fix | Linked PR evidence only; retain milestone. |
| [PR #1084](https://github.com/bldrs-ai/Share/pull/1084) · closed · Save to OPFS on GitHub save action before page reload + end to end save tests + FileContext to Zustand + CI_ENVIRONMENT GHA test blacklist | Linked PR evidence only; retain milestone. |
| [PR #1095](https://github.com/bldrs-ai/Share/pull/1095) · closed · Versions 100: Save imported model -- UI | Linked PR evidence only; retain milestone. |
| [issue #1097](https://github.com/bldrs-ai/Share/issues/1097) · closed · Fix regression on save model reload | Native child of [#887](https://github.com/bldrs-ai/Share/issues/887); existing implementation/bug/test evidence beneath its story. |
| [PR #1143](https://github.com/bldrs-ai/Share/pull/1143) · closed · Auth0 Proxy + Save e2e tests | Linked PR evidence only; retain milestone. |
| [PR #1145](https://github.com/bldrs-ai/Share/pull/1145) · closed · versions-100, notes-100: refactor to use helpers and nested contexts | Linked PR evidence only; retain milestone. |
| [issue #1209](https://github.com/bldrs-ai/Share/issues/1209) · open · Add Breadcrumbs to indicate file path + Change Active Color for Dropdown Menu in Night Theme | Open-dialog breadcrumb/theme outcome; keep with Open/source-picker ownership, no Versions reparenting. |

### Versions 200: Delete a specific version · milestone 24

[Historical milestone](https://github.com/bldrs-ai/Share/milestone/24) · 1 members at inspection.

| Source member and captured state | Applied owner / disposition |
|---|---|
| [issue #890](https://github.com/bldrs-ai/Share/issues/890) · open · Versions 200: Delete a version | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |

### Versions 100: Show a Specific Version · milestone 50

[Historical milestone](https://github.com/bldrs-ai/Share/milestone/50) · 4 members at inspection.

| Source member and captured state | Applied owner / disposition |
|---|---|
| [issue #850](https://github.com/bldrs-ai/Share/issues/850) · open · Versions 100: Show a specific version | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [issue #1154](https://github.com/bldrs-ai/Share/issues/1154) · closed · Versions 100: Show a specific version | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [PR #1155](https://github.com/bldrs-ai/Share/pull/1155) · closed · Show a specific version cypress test | Linked PR evidence only; retain milestone. |
| [issue #1178](https://github.com/bldrs-ai/Share/issues/1178) · open · Flaky test in versions-100/show-specific-version.cy.js | Native child of [#1154](https://github.com/bldrs-ai/Share/issues/1154); existing implementation/bug/test evidence beneath its story. |

### Versions 100: Edit-A-Model · milestone 53

[Historical milestone](https://github.com/bldrs-ai/Share/milestone/53) · 2 members at inspection.

| Source member and captured state | Applied owner / disposition |
|---|---|
| [issue #1160](https://github.com/bldrs-ai/Share/issues/1160) · closed · Versions 100: Edit a model | Native child of [#57](https://github.com/bldrs-ai/Share/issues/57); formal UX story. |
| [PR #1161](https://github.com/bldrs-ai/Share/pull/1161) · closed · Open 100: open model on GH via open UI and versions 100: edit-a-model | Linked PR evidence only; retain milestone. |

### Unclear · milestone 63

[Historical milestone](https://github.com/bldrs-ai/Share/milestone/63) · 24 members at inspection. [#57](https://github.com/bldrs-ai/Share/issues/57), the old Version Control tracker, was reused as the `versions-100` epic. The other 23 members are outside Versions and were left unchanged.

### Explicitly linked or discovered outside those milestones

| Source | Disposition / ownership |
|---|---|
| #848, #960 | Revision-timeline implementation PRs; #848's thread points to #960, which records the switch from commit-ancestor discovery to a file-path query. Evidence only. |
| #913, #916 | Provider-popup login and save/OPFS implementation PRs, linked by #903/#907 comments. Evidence only. |
| #1295, #1297 | Closed Versions-display bug #1295 is under baseline story #1154; its comment links mobile-panel fix PR #1297. No current runtime failure inferred. |
| #637, #630 | Private-source reload/access history; #637's comment says fixed, and #630's thread says replaced by #887/#888 work. Preserve states and Sharing/source-access ownership; no duplicate regression filed. |
| #889 | Git/transport alternatives research, not a user story; linked cross-story support. |
| #1002 | Closed Versions planning/grooming; linked support, not direct epic child. |
| #1269 | Existing cross-feature skipped-test tracker referenced by EditModel.spec.ts; keep linked support without manufacturing a Versions story to house it. |
| #1670 → #1658 | Shell re-home decision retains its existing parent; coordinate Versions placement without force-reparenting. |

#1023 remains open: its existing comment says “cannot reproduce”. Keep it beneath history story #2158 for reproduction/evidence; the reported timeline omission is not asserted as a current regression. #1178 remains open beneath original baseline #1154; a skipped descendant spec is an acceptance gap, not grounds to erase the original completion. Cross-story support retains its original labels even where they historically say `story`; only actual formal UX stories are direct epic children.

## Requirements migration and source ownership

Retired source: [Versions UX draft v0.6 at immutable main 4458ceb](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md). The source has **303 lines**, **57 story-task checkboxes**, **10 user-goal blocks**, **10 acceptance blocks**, **10 dependency blocks**, **four decision rows**, **four gap-analysis rows** and **three final reconciliation checkboxes**. The ten story bodies preserve their source contract verbatim. Non-story common contracts, identity/action table, reconciliation instructions, gaps and decision wording are retained in #57; the semantic boundary introduction is retained in #2144. Relative source-document links are resolved to repository URLs in issue bodies.

The source is retired only after every obligation has an owner. Former V codes below are historical locators, not new epic or story IDs; native issue numbers identify the canonical stories.

| Source span / locator | Canonical owner | Preserved contract and disposition |
|---|---|---|
| [L1–9](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L1-L9) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Document purpose, feature ownership, common rubric/index constraints and Sharing/Notes dependencies. |
| [L11–19](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L11-L19) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Epic goal, end-to-end external journey, opaque pinned links, anonymous viewing and unresolved anonymous local-saving policy; existing functionality is baseline. |
| [L21–23](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L21-L23) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Unified supported origins, many files per repository, no required Share layout; assess local-git input separately. |
| [L25–31](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L25-L31) | [#57](https://github.com/bldrs-ai/Share/issues/57) | All five action contracts: source read, explicit retained copy, local-history import, existing-source link and explicit publication; dependencies stay with Sharing. |
| [L33–33](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L33-L33) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Repository/file/full immutable commit; branch/tag discovery; opaque URLs; source authorship versus importer; distinct revisions despite equal bytes. |
| [L35–35](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L35-L35) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Selected-file history; chosen upstream and deliberate update; unstable-source warning/snapshot path. |
| [L37–37](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L37-L37) | [#57](https://github.com/bldrs-ai/Share/issues/57) | External-source Notes, separate Notes destination capability, original anchor and accurate public/private source/discussion audience. |
| [L39–39](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L39-L39) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Remote availability versus cache versus verified local retention; unavailable upstream remains identifiable. |
| [L41–41](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L41-L41) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Whole-file versus later semantic scope, technical phase aliases and shared GLB/payload/limit decisions. |
| [L177–179](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L177-L179) | [#2144](https://github.com/bldrs-ai/Share/issues/2144) | Later semantic boundary; create-300 prerequisite, Notes independence and STEP whole-file deferral. |
| [L263–273](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L263-L273) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Existing-issue mapping instructions and all three historical-feature/alias rows; corrected #890 deletion mismatch and reuse/dependency decisions. |
| [L275–288](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L275-L288) | [#57](https://github.com/bldrs-ai/Share/issues/57) | All four original gap-analysis rows, evidence starting points, classification limits and cross-feature review obligations. |
| [L290–297](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L290-L297) | [#57](https://github.com/bldrs-ai/Share/issues/57) | All four decision rows: anonymous local work; usable restore experience; provider/local-git coverage; history paging/renames/offline-retention scope. |
| [L299–299](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L299-L299) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Reconcile original issues/acceptance/aliases; mapping audit is recorded here, implementation verification remains separately owned. |
| [L301–301](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L301-L301) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Desktop/mobile walkthroughs covering external revisions, refresh, local save/replace, offline, backup, source/GLB and Notes. |
| [L303–303](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L303-L303) | [#57](https://github.com/bldrs-ai/Share/issues/57) | Intentional breaking changes, migration/recovery, whole-file versus semantic boundary and technical agreement before dependent implementation. |

### Complete story contracts

Each row includes the user goal, every listed source task, the entire acceptance block and the entire dependency block. User-goal/acceptance/dependency text is retained, not reduced to this summary.

| Former group / source | Canonical story | Source tasks | Dependencies and cross-feature ownership |
|---|---|---|---|
| V21 · [L45–67](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L45-L67) | [#850](https://github.com/bldrs-ai/Share/issues/850) · Open versions supplied by an external source | 7 | Existing routing/source read; no local-history or republication prerequisite. Sharing owns the resolver/audience; Notes owns permitted publication/context. |
| V01 · [L69–87](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L69-L87) | [#2157](https://github.com/bldrs-ai/Share/issues/2157) · Save a first local version | 5 | Supported browser/storage and explicit anonymous-policy decision; local saving stays distinct from GitHub publication #887. |
| V02 · [L89–109](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L89-L109) | [#2158](https://github.com/bldrs-ai/Share/issues/2158) · Browse and reopen model version history | 6 | Local first-save #2157 or external source #850; source attribution is not verified identity; Notes owns discussion contexts. |
| V03 · [L111–131](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L111-L131) | [#950](https://github.com/bldrs-ai/Share/issues/950) · Add a replacement file as a new version | 6 | Local save #2157 and history #2158; no structural diff or inferred-edit prerequisite; Notes validates carry-forward. |
| V09 · [L133–153](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L133-L153) | [#2159](https://github.com/bldrs-ai/Share/issues/2159) · Discover and open a newer version deliberately | 6 | History #2158 and Sharing S07; in-app discovery only; protect original Notes/drafts. |
| V11 · [L155–175](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L155-L175) | [#2160](https://github.com/bldrs-ai/Share/issues/2160) · Protect local work and make a usable backup | 6 | #2157/#2158/#950; packaging and usable restore remain decisions; Notes owns draft/anchor/tag/discussion semantics. |
| V13 · [L181–199](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L181-L199) | [#2161](https://github.com/bldrs-ai/Share/issues/2161) · Save and reopen semantic model edits | 5 | create-300 and technical V1–V2; external immutable provenance; consumes editing tools without redefining them. |
| V14 · [L201–219](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L201-L219) | [#2162](https://github.com/bldrs-ai/Share/issues/2162) · Contribute to a shared model history | 5 | #2161 and Sharing S06; share-201 retains permission administration; attribution is not verification. |
| V15 · [L221–241](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L221-L241) | [#2163](https://github.com/bldrs-ai/Share/issues/2163) · Resolve competing semantic edits | 6 | #2161/#2162 and technical V3; relational and structural validity, not textual non-overlap. |
| V16 · [L243–261](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L243-L261) | [#2164](https://github.com/bldrs-ai/Share/issues/2164) · Continue a model round trip through another tool | 5 | Technical V4 and Conway writer; STEP semantic round trip deferred; current whole-file #850/#950 independent; annotation/BCF export separately agreed. |

### Source-task ledger

Each former story's tasks, by line in the [retired draft](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md), and the issue that now owns them. The task wording lives in the issue; this table only maps it.

| Former story | Tasks | Source lines | Owner |
|---|---|---|---|
| V21 | 1–7 | [L51–L63](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L51-L63) | [#850](https://github.com/bldrs-ai/Share/issues/850) |
| V01 | 1–5 | [L75–L83](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L75-L83) | [#2157](https://github.com/bldrs-ai/Share/issues/2157) |
| V02 | 1–6 | [L95–L105](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L95-L105) | [#2158](https://github.com/bldrs-ai/Share/issues/2158) |
| V03 | 1–6 | [L117–L127](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L117-L127) | [#950](https://github.com/bldrs-ai/Share/issues/950) |
| V09 | 1–6 | [L139–L149](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L139-L149) | [#2159](https://github.com/bldrs-ai/Share/issues/2159) |
| V11 | 1–6 | [L161–L171](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L161-L171) | [#2160](https://github.com/bldrs-ai/Share/issues/2160) |
| V13 | 1–5 | [L187–L195](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L187-L195) | [#2161](https://github.com/bldrs-ai/Share/issues/2161) |
| V14 | 1–5 | [L207–L215](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L207-L215) | [#2162](https://github.com/bldrs-ai/Share/issues/2162) |
| V15 | 1–6 | [L227–L237](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L227-L237) | [#2163](https://github.com/bldrs-ai/Share/issues/2163) |
| V16 | 1–5 | [L249–L257](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md#L249-L257) | [#2164](https://github.com/bldrs-ai/Share/issues/2164) |

### Gap-analysis obligations and real decisions

The four original gap rows and their proposed next audit actions are retained in #57. Delivery owners are #850/#2158 for selected-file history, exact-source identity and loading/empty/access states; #2159 for non-main/old-commit refresh and deliberate update; and #2157/#950/#2160 for storage inventory, cancellation/quota/concurrent-save recovery, offline retention, cache safety and usable restoration. #887 owns current GitHub-save result/recovery verification. Cross-feature checks include Sharing's source/GLB packaging and opaque-link audience, and Notes' fixed version/anchor/draft/discussion behavior. No row was dropped because code already exists.

Real product decisions remain in the issues: anonymous local save/history/backup (#57); supported providers/local-git input, depth/paging, renames and offline-retention scope (#57/#850/#2158); backup packaging/restore experience and privacy/account boundaries (#2160); deletion effects (#890); source/derived-GLB payload/identity/selection/anchor mapping and measured device/service limits (#57 with Sharing/Notes and the shared index). Later semantic phases need create-300 identity/op contracts, supported formats, writer availability, validated matching and explicit phase/milestone acceptance (#2144/#2161–#2164). These do not block ordinary viewing or justify a login/model-write prerequisite.

## Commit-pinned source and test-definition findings

Inspected at [4458ceb](https://github.com/bldrs-ai/Share/commit/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c). These are source observations and evidence gaps; no browser walkthrough, test execution or runtime acceptance is claimed by this migration.

- [Commits.js](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/net/github/Commits.js) queries commits by file path. Its `getCommitsForFile` supplies no selected branch/ref argument. #850/#2158 must verify the intended history rather than infer correct non-default-branch behavior.
- [useVersions.jsx](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/useVersions.jsx) waits for auth resolution and permits an empty token for anonymous public-source history. It maps author/date/message/SHA. This is established integration, not a new feature.
- [VersionsPanel.jsx](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/VersionsPanel.jsx) navigates to a selected SHA. Refresh navigates immediately to hardcoded `main`; error rendering is generic. #2159 owns deliberate chosen-upstream update behavior; #850/#2158 own accurate current-version and failure states.
- [VersionsTimeline.jsx](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/VersionsTimeline.jsx) schedules a login message after four seconds without commits and treats the first item as active for a non-40-character ref. Verify loading, empty, denied, rate-limited and non-default-branch identity separately.
- [VersionsTimeline.test.jsx](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/VersionsTimeline.test.jsx) defines two tests: metadata rendering and a navigation callback count. Definitions do not establish correct recipient/version persistence.
- [ShowVersion.spec.ts](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/ShowVersion.spec.ts) skips the multi-revision flow and references #1178. Its mocked revisions use the same model fixture, so this definition does not establish distinct revision content or anonymous recipient pinning.
- [SaveModel.spec.ts](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/SaveModel.spec.ts) includes an active signed-out Save-dialog visibility case; its filled-form/save-result case is skipped. Its comment records changed visibility behavior under #1964, contrasting with #980's original signed-out-hidden checkbox. Preserve historical completion and verify current behavior under #887.
- [EditModel.spec.ts](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/src/Components/Versions/EditModel.spec.ts) skips the whole-file overwrite flow and references #1269. These three historical specs do not use `describeMobileAndDesktop`; establish desktop/mobile actual-result coverage explicitly.

## Applied hierarchy and preservation verification

*Update 2026-11-18:* the epic and story bodies were rewritten to the rubric's size and plain-language rules (§"Write for a reader who wasn't there"). Each existing issue's original description, its checkboxes included, now sits verbatim in a collapsed block at the end of its body. Every task, acceptance test, dependency and open decision was kept. The checks below describe the bodies as of 2026-11-12.

The applied native hierarchy has **27 new parent/child links across 29 issues**: 12 formal direct stories beneath #57, four formal semantic stories beneath #2144, and 11 existing implementation/bug/test records beneath their clear story owners. Existing #1670 → #1658 remains intact. No story, bug, task or epic was closed or reopened. Only #950 gained `story`, and #57/#2144 gained `epic`; every original label remains. All milestone metadata and assignments and all assignees remain unchanged. The ten edited existing bodies retain their original nonempty descriptions; #934 had an empty body and gains an explicit goal/follow-up without invented completion.

The original **59 checkbox lines** in those ten existing issues remain byte-for-byte and in sequence, including **five completed lines**. The migration preserves all 57 source story tasks, all ten user goals, all ten acceptance blocks, all ten dependency blocks, all three final reconciliation checkboxes, all four decision rows and all four gap rows. Ownership also covers the common preamble/action/identity contracts and the later semantic boundary; source links/aliases are retained. Direct native children were checked for the formal story prefix/label, and each expected nested parent was checked independently. Comments were not written, deleted or edited.
