# Versions UX Requirements Draft

**Draft v0.6 · 2026-11-11 · Existing Versions feature evolution · Target UX**

Versions lets people open, identify, retain and revisit exact model revisions from GitHub, browser-local histories and other explicitly supported sources. It extends the existing Versions experience. This document owns source identity, history navigation, local retention, backups and later semantic version workflows; Sharing owns publication and links, and Notes owns anchored discussion.

The [UX index and shared requirements](README.md) define the Epic → Story → Task rubric, shared acceptance constraints and cross-feature decisions. The agreed canonical scheme uses roadmap epic codes and existing GitHub issue numbers for stories; see the index. This document’s S/V codes remain temporary locators until its triage. Notes has moved to notes-100, with its former N17–N20 aliases recorded in the pilot crosswalk. Each story includes its tasks and acceptance criteria. Cross-document dependencies refer to the owner listed in the index.

**Related requirements:** [Sharing](sharing.md) (S04–S08, S10, S12) · [Notes](notes.md) (notes-100).

## Epic and scope

**As a model author or viewer, I want to open and retain specific model revisions and move deliberately through their history, so that I can revisit earlier work without losing its content or origin.**

The external-source journey is: open an existing model from GitHub → select or resolve an exact file revision → view it in Share → copy a version-specific Share link → another person with source access opens the same revision → optionally save a local copy or check for a newer upstream revision. Creating a local history or publishing a copy is not a prerequisite. Copy link produces an opaque Share URL while preserving the resolved source revision; a public GitHub source remains publicly discoverable at GitHub.

Local viewing and “Anyone with the link” viewing remain available without login; existing public-source viewing also remains supported. The logged-in author stories below do not establish a new login gate for local viewing. Whether anonymous authors get the same local version-saving tools is an open product decision.

- Versions management describes and extends the existing GitHub Versions integration and its existing 100–200-level story history. External file history and revision navigation are established capabilities; local retention and other supported sources extend that user experience.

## Version origins and source identity

Versions is one user-facing capability across supported origins. A version can belong to an existing external history or a local history retained through Share. GitHub is the established external integration: a repository may contain many models, and Share identifies the selected file and revision without requiring that repository to adopt Share’s model-history layout. Local git repository input is the next source direction to assess, distinct from saving browser-local history; its access and supported operations need an explicit gap assessment.

| Action | UX contract |
|---|---|
| Open an external revision | Read and display the selected model at its source revision. No ownership, write access, new repository or re-upload is required. Existing source access rules still apply. |
| Save a local copy | Explicitly retain the selected version’s model data on this device, preserving its origin. A recent link or temporary viewing cache alone is not a saved offline copy. |
| Add to a local history in Versions | Explicitly import a selected source revision into a new or chosen local history, with provenance. Do not imply that the entire upstream history was copied or rewritten. |
| Share an existing version link | Create an opaque Share link resolving to the same source file and immutable revision. A publicly accessible source remains readable; a restricted source still requires the recipient’s access. Never embed provider credentials in the URL. |
| Publish a model copy | Explicitly choose a destination and complete the publication flow. Reading or commenting on a source does not authorize republication to anyone holding a link. |

For GitHub, retain the repository, file path and full commit identity, with the selected branch or tag as discovery context. Resolve a moving branch or tag to an exact commit when opening it; saved version links resolve internally to that revision, and note anchors retain it. Newly copied Share URLs use opaque random tokens rather than exposing repository/path/commit components in the URL. Keep original source authorship distinct from the person who imported or published a copy. Different external revisions must not be conflated just because the model bytes happen to match.

History browsing concerns the selected model file, not every unrelated repository commit. Newer-version discovery follows its chosen upstream history; it does not silently replace the version being viewed. If a source cannot provide a stable revision, explain that limitation and offer an explicit supported snapshot/local-save path rather than label a mutable URL an exact version.

The same viewing and notes requirements apply to externally supplied versions. Notes may use a separately configured, permitted destination, but must retain the original source revision and anchor. An existing public model need not be republished to receive notes. Its source stays labeled Public at source; a public GitHub issue is also discoverable at source and must not be presented as an unlisted discussion. Opening a private source preserves its current access rules and does not introduce a private-notes service or automatic anonymous access.

Source availability and local retention are separate: a version can be externally hosted, cached for viewing, or explicitly saved locally. Only verified retained data supports an offline-availability claim. Deleted or inaccessible upstream revisions remain identifiable, but Share must not promise remote availability it does not control.

Whole-file requirements V21, V01–V03, V09 and V11 apply to the next Versions experience. V13–V16 remain later semantic editing work, not a prerequisite for viewing or notes. The technical V0–V4 phase names in dependencies are planning references, not claims that every capability is new. Derived GLB identity, payload scope and support limits are shared decisions in the index.

## Versions stories

### V21 Open versions supplied by an external source

**As a model viewer, I want to open an existing model revision from a source such as GitHub, so that I can inspect, share its link and discuss it in Share without first importing or publishing a new model history.**

**Tasks**

- [ ] Open a supported model through a source link or connected-source picker, using anonymous access for public models and the existing source-read flow where access is required.

- [ ] Choose a model file and available revision; when given a branch or tag, resolve and retain the exact revision that was opened.

- [ ] Display the source repository/path and revision, distinguishing original author/source metadata from the person viewing or saving a copy.

- [ ] Open available earlier revisions of the selected file without showing unrelated repository changes as model versions.

- [ ] Generate an opaque exact-version Share link without writing to the upstream repository, creating a model repository or uploading a copy. Label a public source accurately and do not imply that the link bypasses restricted-source access; creating the durable link mapping is permitted.

- [ ] Offer local saving or importing into a local history in Versions as explicit separate actions; preserve source provenance and state whether the model is available offline.

- [ ] Keep the current version and its notes fixed when the upstream branch advances. If a stable revision or the requested file is unavailable, explain the limitation instead of silently substituting newer content.

**Acceptance:** From an existing public GitHub repository containing an IFC or STEP file at two commits, open the older revision anonymously, inspect it and copy a Share link. Advance the upstream branch outside Share, then open the copied link in another browser: it still identifies and displays the older revision while available. No model upload or repository mutation occurred. A permitted reviewer can draft and publish a note against that source revision without needing model-write access. The copied Share URL uses an unguessable token; the UI discloses that the upstream repository remains public and can be discovered independently.

**Dependencies:** Existing source routing, source-read authentication and version navigation. This entry path does not depend on V01 or S04–S06. Other source providers require their own explicit capability coverage.

### V01 Save a first local version

**As a logged-in user, I want to save an IFC or STEP model as the first version of a local history, so that I can return to that exact model later without publishing it.**

**Tasks**

- [ ] Choose a local file or explicitly save an opened external revision locally, and see its name, format, size and source identity before saving a version.

- [ ] See progress and cancel while the version is being prepared.

- [ ] See a clear “Saved on this device” state only after saving completes, with a way to reopen the version.

- [ ] Keep the original file unchanged and upload no model bytes as a consequence of local open or save.

- [ ] If local saving is unsupported or storage is full, explain the limitation and preserve ordinary viewing where the device supports it.

**Acceptance:** Save a file, reload the application, and reopen the saved version with the same model content. Cancelled or failed imports never appear as completed versions. Repeat with an explicitly saved GitHub revision: its local copy reopens with the original provenance, and the upstream repository remains unchanged.

**Dependencies:** Supported browser/storage behavior. Anonymous saving policy remains open.

### V02 Browse and reopen model version history

**As a model viewer, I want to browse available versions of a model from its external source or my local history and open one deliberately, so that I can inspect earlier work without replacing it.**

**Tasks**

- [ ] Show a distinguishable version identifier, recorded time, and author or source attribution where available.

- [ ] Identify the version currently open, its origin and revision, and whether its data is externally hosted, saved locally or published through Share.

- [ ] Open a selected historical version without changing any saved version or advancing the published version.

- [ ] Reopen locally saved versions without a network connection when the application and required model data are available locally.

- [ ] Explain when a version exists in history but its model data is unavailable on this device.

- [ ] Show which notes belong to the selected version and distinguish later discussion activity from a new model version.

**Acceptance:** After saving two different versions, open each in turn and verify that its content and current-version indicator match the selection. Opening the older one does not replace the newer one. Repeat against an existing GitHub file’s history without first creating a local history. Unrelated repository commits must not be presented as new versions of that model.

**Dependencies:** V01 for a local history or V21 for an external history. Attribution must distinguish the source author from a local importer and must not imply a verified identity when only author metadata is available.

### V03 Add a replacement file as a new version

**As a logged-in user, I want to add a revised local file or a selected external revision to a local model history in Versions, so that I can preserve both the previous model and the revision with its origin.**

**Tasks**

- [ ] Choose explicitly between starting a new model history and adding a version to an existing history.

- [ ] Confirm the target local history and replacement file or exact external revision before saving; preserve the source reference without modifying the upstream history.

- [ ] Preserve every previously completed version while adding the new one.

- [ ] When the source bytes and relevant metadata are unchanged, explain that there is no new version to save.

- [ ] If preparation fails or is cancelled, leave the last completed history usable.

- [ ] Preserve notes on the original version when a replacement is imported; carrying an anchor forward requires explicit validated mapping rather than reuse of a file-local element number.

**Acceptance:** Add a changed IFC or STEP file, then reopen both revisions. Each shows its own content; adding the revised file has not silently modified or published the original. Import a selected GitHub revision as another local version and retain its repository, file and commit provenance. This does not claim to import all upstream commits.

**Dependencies:** V01–V02. Structural comparison and inferred model edits are later capabilities.

### V09 Discover and open a newer version deliberately

**As a returning recipient, I want to check for newer published versions and decide whether to open one, so that an ongoing review does not change underneath me.**

**Tasks**

- [ ] Offer a way to check for a newer version of the same model history, including the selected file’s upstream GitHub branch when the model is externally hosted.

- [ ] Distinguish the version I am viewing from the newer version available.

- [ ] Keep me on my current version until I explicitly choose to open the update.

- [ ] Preserve local work, including saved draft notes, before switching and let me return to the earlier version. Do not move drafts or published note anchors onto the newer version implicitly.

- [ ] If update discovery is unavailable or the history has diverged, explain that state without substituting a different model.

- [ ] When sharing after an update, generate an opaque link bound to the exact version now open; do not retarget the old link. Only offer updates/history permitted by the current link scope or independently accessible at the source.

**Acceptance:** A recipient keeps version A open while the author publishes B. A remains on screen until the recipient chooses B; A’s original link still identifies A. A note written on A still opens A; its draft or discussion does not become a note on B merely because B was opened. Repeat when B is committed outside Share to the upstream GitHub repository. The current model and all notes on A remain pinned to A.

**Dependencies:** V02 and S07. Initial update discovery is in-app; email, push notifications and live following are outside scope.

### V11 Protect local work and make a usable backup

**As a logged-in user, I want to know which versions exist only on this device and back them up, so that clearing caches or losing the browser does not surprise me with lost work.**

**Tasks**

- [ ] Identify local-only, externally hosted, published-through-Share and pending versions without treating login, a recent link or a temporary cache as proof of backup or cross-device sync.

- [ ] Preserve saved versions and pending work when I use the application’s Clear cache action; also preserve saved draft notes and unsent replies.

- [ ] Explain that clearing browser site data or losing the device can remove local-only work.

- [ ] Export a backup containing the model history and the model files it needs, with progress and a clear completion state. Include saved drafts, anchors, tags and locally available discussion content; keep this personal backup separate from shared publication. For external revisions, say which source files and history are actually included; a reference-only export must not be labeled a complete offline backup. Treat any retained bearer links as access-bearing information; restoring a backup must not silently mint, broaden or publish sharing capabilities.

- [ ] Provide a documented, validated way to restore that backup; identify missing or invalid data rather than claiming a complete recovery. Distinguish a restored draft, a cached published discussion and a newly synchronized discussion; restoration must not republish notes or duplicate replies.

- [ ] Warn before any separate action that intentionally deletes local history; ordinary cache cleanup is not that action.

**Acceptance:** Save an unpublished version, clear the application cache, and reopen it. Restore a backup in a separate clean environment and reopen its retained versions without relying on the original browser. Restore a private draft with its original anchor and tags without exposing it publicly.

**Dependencies:** V01–V03. Backup packaging and the first-release restore experience must be specified; backup cannot mean a history file whose model data is missing.

## Later semantic editing stories

These stories describe later semantic model editing and merging. They do not expand the current whole-file Versions, sharing and Notes implementation scope. Existing Notes and the target Notes requirements do not depend on semantic editing. IFC semantic editing depends on create-300; STEP remains whole-file versioning until its editing and identity requirements are supported.

### V13 Save and reopen semantic model edits

**As a logged-in user, I want to save a version containing supported model edits, so that I can reopen and share the result I reviewed.**

**Tasks**

- [ ] Show that model edits are unsaved and distinguish them from camera, selection, visibility or other view changes. Creating a note or replying changes the discussion, not the model’s semantic edit history.

- [ ] Support undo and redo for supported document edits before saving, including edits initiated by an agent.

- [ ] Save the effective result after undo or redo, not an abandoned intermediate state.

- [ ] Reopen the saved version with the same edited properties, placement and geometry for supported operations.

- [ ] Identify unsupported edits or formats before committing to an operation that cannot be preserved.

**Acceptance:** Apply an edit, undo another, save, then reopen in a clean and a previously used browser. Both show the same intended edited model. Moving the camera alone does not create a document-edit version. Saving or publishing a note does not create an IFC/STEP geometry edit or enter model-edit undo history.

**Dependencies:** create-300 and semantic integration V1–V2. This story consumes the editing tools; it does not redefine their entire UI. The immutable source may be an external revision; preserve that provenance and keep local edits distinct from an upstream update.

### V14 Contribute to a shared model history

**As a logged-in user with write access, I want to publish my supported edits into a shared history, so that collaborators can review and open my contribution.**

**Tasks**

- [ ] Show the account, destination and version on which my contribution is based. If based on an external model, distinguish its upstream source from the destination that will receive my contribution; never assume that viewing or commenting grants upstream write access.

- [ ] Let me review the supported change summary and record a meaningful description before publication.

- [ ] Publish a distinct version with author attribution and an opaque exact-version link, retaining the intended link audience.

- [ ] Preserve my local work if permission is missing, revoked or expires during publication.

- [ ] Offer an appropriate reconnect, request-access guidance or separate-history path without pretending that I have write access.

**Acceptance:** An authorized contributor publishes an edited version that another person can open. A contributor without write permission cannot change the shared history, and retains their local work. Existing notes retain their original version context; publishing edited geometry does not silently relocate or resolve a discussion.

**Dependencies:** V13 and S06. Permission administration remains share-201; author attribution is not a verified identity badge.

### V15 Resolve competing semantic edits

**As a logged-in collaborator, I want compatible edits combined and conflicting edits presented for resolution, so that shared work advances without silently losing either person’s changes.**

**Tasks**

- [ ] Show the common starting version and the two sets of contributions.

- [ ] Combine compatible supported edits and provide a reviewable summary of the result.

- [ ] Clearly identify conflicting edits, including deletion versus modification and changes affecting shared model data.

- [ ] Preserve both alternatives until I explicitly resolve the conflict or abandon the merge.

- [ ] Prevent publication of an unresolved or structurally invalid result and explain the blocking condition.

- [ ] Save the accepted result as a distinct version while retaining the earlier histories.

**Acceptance:** Two independent compatible edits both survive in the combined model. Competing edits to the same affected data block completion until resolved. Cancelling resolution loses neither contributor’s work. Notes and replies remain attached to their recorded versions; merging model edits does not silently merge, delete or resolve discussions.

**Dependencies:** V13–V14 and V3 semantic merge. Validating compatibility includes model relationships, not just whether text files overlap.

### V16 Continue a model round trip through another tool

**As a logged-in user, I want to export a supported edited model and bring a revised export back into its history, so that I can continue work across Share and my authoring tools.**

**Tasks**

- [ ] Show which source formats and edits can be exported, with any meaningful limitations before export.

- [ ] Export the selected version’s edited state, not the original unedited file presented as the edited result.

- [ ] Import an externally revised model as a new revision while retaining prior versions.

- [ ] Present supported change attribution and matching ambiguities for review instead of silently assigning changes to the wrong elements.

- [ ] Offer whole-file versioning when semantic matching or export is unsupported, with clear wording about what is and is not preserved.

**Acceptance:** Export a supported edited IFC fixture, modify it externally, and bring it back. Review the recognized changes, resolve or decline ambiguous matches, and reopen both earlier and resulting versions. Notes remain available in Share at their original versions; the export flow must state whether annotations are included. Embedding notes or BCF interchange requires a separately agreed export capability.

**Dependencies:** V4 and an appropriate Conway writer. Semantic STEP round trips remain deferred until supported explicitly. Receiving externally authored whole-file revisions is already covered by V21/V03; it does not wait for this semantic round-trip or writer capability.

## Existing feature and story reconciliation

Versions already has a mix of established and evolving stories. Map the draft requirements to the existing 100–200-level story history before assigning implementation work. The current [roadmap feature inventory and ID history](../roadmap.md) also records later renumbering; old IDs are aliases, not additional features. This inventory is a starting point, not a completed audit of issue scope or status.

| Existing feature or historical ID | Current roadmap reference | Relationship to this draft | Remaining reconciliation |
|---|---|---|---|
| Specific-version and branch/commit navigation | `versions-100`; [#850](https://github.com/bldrs-ai/Share/issues/850), [#890](https://github.com/bldrs-ai/Share/issues/890) | V21, V02, V09 describe the complete target navigation experience. | Read the existing stories and their acceptance; retain satisfied work and identify changes for origin, selected branch and stable revision. |
| Version diff; historical `versions-110` / `versions-200` | `versions-300` | Related to later review/comparison needs in V13–V16. Structural diff is not equivalent to semantic merge. | Reuse relevant diff work without treating V15 as a duplicate or declaring diff part of whole-file saving. |
| Portable versions; historical `versions-120` / `versions-210` | `versions-310`, Track T6 | Related to V01–V03/V11 and provider-neutral history. | Separate existing portable-sidecar work, browser-local retention and external local-git input; confirm overlap before creating tasks. |

For each existing story, record its canonical issue/feature ID, historical alias, current UX and acceptance, matching feature-prefixed story/task requirements, retain/extend/replace disposition, and remaining work. Keep its existing epic ownership where appropriate; link Sharing dependencies instead of moving every Versions story under share-200. New feature IDs and issue creation remain deferred until that mapping is agreed.

## Existing UX gap analysis

**Gap analysis status:** Initial observations are based on source and test definitions reviewed on GitHub `main` on 2026-11-11. Live UX walkthroughs, an exact build/commit and full issue reconciliation remain pending. An unverified capability is not necessarily missing. Use Retain, Extend/change, Verify and Decide dispositions, as defined in the index.

| Area / requirements | Existing evidence | Provisional gap or disposition | Next audit step |
|---|---|---|---|
| GitHub file history and revision selection — V21, V02 | `useVersions` fetches commits for the selected file; the timeline displays author, date and message; `VersionsPanel` navigates to a selected SHA. Timeline tests cover rendered metadata and the navigation callback. | **Retain + verify.** These are existing Versions capabilities. Exact branch/tag resolution, provenance, source permissions and pinned links need end-to-end verification. | Open two revisions of one file in a multi-model repository, anonymously and with source access; verify current-version identity, navigation and copied links. |
| Refresh and newer-version discovery — V09, V21 | `VersionsPanel` exposes a Refresh action that navigates to hardcoded `main`. | **Extend/change.** The target follows the chosen upstream history, distinguishes checking from opening, and preserves the current version until deliberate navigation. | Walk through a non-main branch and an older commit; record current labels and navigation, then specify the revised interaction. |
| Loading, empty history and access failures — V02, S12 | `VersionsTimeline` schedules a GitHub login message when commits remain empty; the panel renders a generic error label. `useVersions` permits anonymous public-source fetching after auth resolution. | **Extend/change + verify.** Empty, loading, rate-limited and unauthorized states must not all suggest login; public viewing remains available. | Exercise signed-out public history, slow/empty results and provider failures; capture each message and recovery action. |
| Local retention, replacement versions and backup — V01–V03, S10, V11 | The inspected GitHub history components do not establish browser-local persistence or recovery behavior; this is not a finding that the rest of Share lacks it. | **Verify, then extend.** Integrate retained versions into Versions with explicit origin and storage state. Local git input is a separate source capability to assess. | Inventory current save/cache/export paths; test reload, offline reopening, cache clearing, storage failure, concurrent saves and backup restore. |

Versions starting points: [useVersions](https://github.com/bldrs-ai/Share/blob/main/src/Components/Versions/useVersions.jsx), [VersionsPanel](https://github.com/bldrs-ai/Share/blob/main/src/Components/Versions/VersionsPanel.jsx), [VersionsTimeline](https://github.com/bldrs-ai/Share/blob/main/src/Components/Versions/VersionsTimeline.jsx), and [timeline test definitions](https://github.com/bldrs-ai/Share/blob/main/src/Components/Versions/VersionsTimeline.test.jsx).

Sharing owns the source/GLB publication and opaque-link gap. Versions must supply exact revision identity and retained data; Notes must validate anchors against that identity. Review these boundaries together rather than implement separate histories for each feature.

## Decisions

| Decision | Starting position for discussion |
|---|---|
| Anonymous local history | Local viewing is already anonymous. Decide whether local save/history/backup also work without login; the draft recommends allowing them when browser storage permits. |
| Backup and restore experience | Decide whether first-release recovery uses an in-app restore flow or another documented supported tool. A usable round trip is required either way. |
| External-source coverage | GitHub file revisions extend the existing integration. Assess local git repository input next, separately from browser-local retention. Choose other versioned providers explicitly; the provider-neutral requirement does not claim all source adapters are implemented. |
| External history and offline retention | Decide history depth/paging, file-rename handling and how users explicitly retain external revisions offline. An upstream history view is not a promise to mirror the entire repository. |

- [ ] Reconcile existing Versions stories and acceptance with this draft, including historical IDs, before assigning the remaining work.

- [ ] Walk through GitHub revisions, branch refresh, local save/replace, offline retention and backup restore on desktop/mobile; include source/GLB identity and Notes context.

- [ ] Record deliberate breaking changes, migration/recovery and the boundary between current whole-file work and later semantic editing; agree the technical mapping before creating issues.
