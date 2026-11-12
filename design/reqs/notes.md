# Notes UX Requirements Draft

**Draft v0.7 · 2026-11-12 · notes-100 reconciliation pilot · Target UX**

Notes lets collaborators discuss a model in context through the existing GitHub-backed notes, replies and placemarks. The target makes exact-version context, private local drafts, publication state and colored topic tags explicit. This document owns the discussion lifecycle, note permissions, anchors and organization; Versions supplies model identity/history, and Sharing supplies the link and audience contract.

The [UX index and shared requirements](README.md) define the Epic → Story → Task rubric, shared acceptance constraints and cross-feature decisions. Canonical Notes stories use the epic prefix `notes-100:` plus their user-visible title; the existing GitHub issue number identifies each story. Tasks remain checkboxes in that story’s body. The [Notes 100 pilot](notes-100-triage.md) maps these requirement groups to existing stories and identifies missing coverage. Former N17–N20 codes are migration aliases only; Sharing/Versions references remain temporary locators pending their triage.

**Related requirements:** [Sharing](sharing.md) (S04–S08, S10, S12) · [Versions](versions.md) (V21, V01–V03, V09, V11; later V13–V16).

## Epic and scope

**Canonical epic:** [notes-100: Anchored notes · #670](https://github.com/bldrs-ai/Share/issues/670). Native sub-issues track the work hierarchy; historical milestones remain intact for reference.

**As a logged-in reviewer, I want to place, privately prepare, publish and organize notes on a specific model version, so that collaborators can discuss the same context without exposing unfinished work.**

**Notes collaboration journey and acceptance:** Open a Share-published or externally hosted version → place a note on the model → save it as a private draft (local storage only) → add colored topic tags → publish to a permitted notes destination → another person follows the note link to the same source version and location → an authorized collaborator replies. Reloading preserves a saved draft; publishing the model does not publish that draft. When a newer model version appears, the original note still opens its original context, and filtering by a topic finds the corresponding notes. Repeat against an existing public GitHub file without creating a new model repository or requiring model-write access.

- Notes collaboration describes and extends the existing anchored Notes integration with GitHub and its existing 100–200-level story history, including discussion, replies, and placemark/navigation behavior. The target adds or refines lifecycle, version context and topic organization through that experience. It does not require semantic model editing, live chat, or the full GitHub issue-management UI.

## Notes behavior and scope

A note is an existing Share discussion attached through model context and placemarks, backed by GitHub issues/comments where that integration is used. The target contract makes its model-version identity explicit: a short titled discussion attached to a chosen location or supported element, with the view needed to revisit it. “Notes” remains the product term; comments are the note’s text and replies. Notes retain author and creation time, record source version and anchor, and may have colored topic tags. Extending this contract must account for existing thread identities and links.

| State | User meaning | Visibility and actions |
|---|---|---|
| New | A note has been started but no durable draft has been saved. | Visible only to its author in the current session. Compose, place, save as Draft, or discard; do not label it saved. |
| Draft | The author’s note is saved locally and can be resumed. | Private to the author on this device. Edit text, placement and tags; publish explicitly when permitted, or discard. No cloud sync is implied. |
| Published | The notes service confirms that the note is available to its intended audience. | Readers can open its version and anchor; authorized users can reply. For an unlisted share, note reading requires the shared link. If the notes destination is public at source, disclose that broader discoverability before publication. |

Saving or autosaving a New note moves it to Draft only after storage succeeds. Publishing has transient progress and failure states; a failed attempt retains the draft. Published is a visibility state, not an issue-resolution state. New and Draft are Share authoring states, not claims about GitHub’s native issue states. Colored topic tags describe subject matter and remain separate from publication state.

The target Notes scope covers placement, title/body, private local drafts, explicit publication, replies, and selecting/filtering colored topic tags, together with existing supported note actions. Audit current edit/delete behavior and permissions as part of the baseline; these actions are not presumed absent. Assignees, milestones, project boards, due dates, expanded resolution workflows and notifications are not added by this subset. Any change to existing post-publication actions or permissions, and shared tag administration, needs an explicit disposition in the gap analysis.

**Version contract:** Every published note and note link identifies its original model version and location. The proposed discussion behavior is a live thread attached to that fixed version: replies may arrive later, with timestamps, while the model bytes remain pinned. The UI must distinguish the model version from discussion activity. If immutable discussion snapshots are required, their UX and storage contract must be decided separately.

Notes must work without cross-version semantic matching. When an anchor cannot be resolved, keep the text, original version and saved view accessible and explain the missing location; never silently attach the note to a different element. Drafts stay out of shared model files, published history, logs and shared snapshots.

The same viewing and notes requirements apply to externally supplied versions. Notes may use a separately configured, permitted destination, but must retain the original source revision and anchor. An existing public model need not be republished to receive notes. Its source stays labeled Public at source; a public GitHub issue is also discoverable at source and must not be presented as an unlisted discussion. Opening a private source preserves its current access rules and does not introduce a private-notes service or automatic anonymous access.

Read access, model-write access and notes contribution permissions are distinct. Public GitHub issues remain Public at source; an opaque Share link does not make their contents unlisted. The full audience and token contract is owned by Sharing. Private Drafts remain local storage only, and model publication never sends them.

## notes-100 requirements

### notes-100: Place a note on a model version

**Existing story:** [#1059](https://github.com/bldrs-ai/Share/issues/1059). Publication obligations also appear in the discussion group below.

**As a logged-in user, I want to place a note on a model location or supported element, so that collaborators can see exactly what I am commenting on.**

**Tasks**

- [ ] Start a New note from the model view or a supported selection and see a provisional marker.

- [ ] Enter a short title and comment body, with the current model version visible in the composer. For external input, show the originating repository/file and resolved revision rather than assuming the model was uploaded through Share.

- [ ] Capture the chosen location or supported element and a useful camera view; let me adjust the placement before publishing.

- [ ] Preview the note’s marker and saved view before saving it as a Draft.

- [ ] Keep the note associated with the version on which I placed it; explain when an element-based anchor is unsupported and offer supported spatial placement where available.

- [ ] Discard a New note without leaving a published marker or changing model content; warn before losing unsaved text.

**Acceptance:** Place a note on a recognizable location in an IFC model and a STEP model, using a supported spatial anchor when element anchoring is unavailable. Save and reopen the Draft: its text, version, marker and view match. The note is absent from another user’s view. Repeat on an existing GitHub revision with source-read access only: the draft records that exact upstream context without uploading the model.

**Dependencies:** An opened version from V01/S07 or V21, plus existing Notes and placemark capabilities. Cross-version element identity, Share model publication and model-write permission are not prerequisites for drafting a note.

### notes-100: Save and resume private draft notes

**Story issue:** pending duplicate search. The pilot cohort contains no matching durable-private-draft story.

**As a logged-in user, I want to save and revise draft notes before publishing, so that I can prepare feedback without exposing unfinished comments.**

**Tasks**

- [ ] Clearly distinguish a New unsaved note from a Draft that has been saved on this device.

- [ ] Save and resume the title, body, complete source-version reference, anchor, camera and selected topic tags after reload; a source branch advancing must not retarget the draft.

- [ ] Edit or discard a Draft without changing published model data or another user’s discussion.

- [ ] Preserve saved drafts through offline use, version navigation and application cache clearing; report storage failures without claiming that unsaved changes were saved.

- [ ] Keep drafts out of link sharing and model publication, including when I publish a newer version of the same model.

- [ ] Keep a draft scoped to its author/account in the app; switching accounts must not expose it as the other account’s work or silently publish under that account.

**Acceptance:** Save a Draft, reload offline with the required local data available, and resume it. Clear the application cache, switch model versions and return: the saved draft survives. Publish the model and confirm from a separate anonymous browser that the Draft is not visible.

**Dependencies:** notes-100 placement and V11. Device-local persistence is the starting scope; cross-device draft sync and anonymous drafting remain open decisions.

### notes-100: Publish notes and reply in context

**Existing stories:** create/publish [#1059](https://github.com/bldrs-ai/Share/issues/1059), reply [#978](https://github.com/bldrs-ai/Share/issues/978), share [#1071](https://github.com/bldrs-ai/Share/issues/1071), and open shared note [#1072](https://github.com/bldrs-ai/Share/issues/1072). This is a requirement group spanning those stories, not a replacement umbrella issue.

**As a logged-in collaborator, I want to publish a prepared note and reply to published notes when permitted, so that we can discuss a model in its original context.**

**Tasks**

- [ ] Review the note’s title, body, anchor, model version, topic tags, acting account and audience before publishing.

- [ ] Show whether the note and replies are available to anyone holding the model/note link or are Public at source, and require an explicit publish/send action. Do not silently send unlisted discussion content to a publicly browsable issue. Draft saving and model publishing do not send comments.

- [ ] Check the selected notes destination’s permission to create a note or reply, separately from permission to upload model versions.

- [ ] Keep the Draft until the notes service confirms publication; provide reconnect/retry on failure and prevent duplicate notes after an uncertain result.

- [ ] Provide an opaque note link that opens the published discussion on its original version and anchor only within the intended share scope. A visible issue or note number alone must not bypass the link’s access rules.

- [ ] Let authorized collaborators reply with visible attribution and timestamps; preserve unsent reply text on a failed send and reconcile retries without duplicating or overwriting another person’s reply.

- [ ] Let anonymous holders of the appropriate link read an unlisted thread. For an explicitly public-source discussion, anonymous source reading remains available. If discussion updates are live, show timestamps and refresh state without changing the pinned model version.

**Acceptance:** Publish a Draft and open its link in a clean signed-out browser: the correct model version, note and location appear. A permitted collaborator replies and the thread retains both contributions. An unauthorized or interrupted send leaves recoverable text and no false success or duplicate note.

**Dependencies:** notes-100 note placement and private drafts and the relevant identity, viewing and notes-destination capabilities. The model version may already be accessible through an external source such as GitHub; Share publication is not required. Publishing a note must not silently upload a local-only model or copy an external model. Check notes permissions separately from model-write permission. If the source repository cannot host comments, retain the draft and explain the supported destination/configuration options; do not silently create a repository or publish elsewhere. The notes destination must support the declared audience. A public GitHub issue requires explicit Public at source disclosure; it cannot serve as a concealed backend for an unlisted thread.

### notes-100: Find model notes using colored topic tags

**Existing stories:** browse [#1054](https://github.com/bldrs-ai/Share/issues/1054) and select [#1055](https://github.com/bldrs-ai/Share/issues/1055). A basic tag-selection/filtering story is pending duplicate search.

**As a reviewer, I want to browse model notes and filter them by colored topic tags, so that I can focus on a subject and navigate to the relevant locations.**

**Tasks**

- [ ] Show a notes list connected to visible model markers; selecting either opens the same note and restores its supported saved view.

- [ ] Display note title, author, original model version and publication state where relevant; show a user’s Drafts only to that author. Include the source identity so notes on similarly named files from different repositories are not mixed together.

- [ ] Let an author choose zero or more available topic tags while drafting, with a readable name and consistent color in the composer, list and note detail.

- [ ] Filter by topic in the list and model markers consistently, explain how multiple selected tags combine, and provide a clear-filter action. Topic filtering is restricted to notes accessible in the current share; it must not provide a global directory of unlisted models or discussions.

- [ ] Distinguish “no notes,” “no matching notes,” and “notes unavailable”; include a way to find untagged notes.

- [ ] Distinguish notes on the current version from notes on older versions. Opening an older note explicitly navigates to its source version, preserving saved drafts and never drawing its marker on an unverified replacement element.

- [ ] Keep a note accessible when its original anchor is missing: show the text, version and saved view with a clear location warning.

**Acceptance:** Publish notes with two different topic tags plus an untagged note. Filtering yields the matching notes and markers; clearing restores the full selected version’s list. Open a note from an older version and verify that it takes me to that version, while a missing anchor yields a warning rather than a marker on the wrong element.

**Dependencies:** notes-100 authoring and discussion and V02/V09. Color is supplementary to tag text. Shared tag creation, renaming/recoloring and the default taxonomy remain decisions rather than implicit permissions.

## Existing feature and story reconciliation

The [Notes 100 pilot](notes-100-triage.md) is the issue-by-issue crosswalk and tier rubric. It retains the nine original product stories, includes the two adjacent comment edit/delete stories omitted by the supplied query, and separates planning/support work. The milestone audit maps related bugs and legacy tasks into native sub-issues under their owning stories. Edit, removal and source navigation are required baseline coverage even though they were not separate groups in the first UX draft. “Delete note” currently closes the GitHub issue; final removal wording and semantics remain a product decision.

Notes already has 100–200-level stories and established GitHub-backed discussion behavior. The [roadmap feature inventory and ID history](../roadmap.md) records both current IDs and historical aliases. Reconcile those stories with this target before creating or renumbering issues; this inventory does not claim their implementation status.

| Existing feature or historical ID | Current roadmap reference | Relationship to this draft | Remaining reconciliation |
|---|---|---|---|
| Anchored GitHub notes | `notes-100`; anchoring work [#892](https://github.com/bldrs-ai/Share/issues/892) under `view-230` | notes-100 build on existing notes, replies and placemarks. | Map existing acceptance and permissions, including edit/delete and links, to retained behavior and lifecycle/version/tag changes. |
| BCF round-trip; historical `notes-110` | `notes-200` | Related interchange capability; not the same as Draft/Published states or topic tags. | Preserve the existing scope and link dependencies. BCF remains separately scoped; this split does not add it to Notes authoring delivery. |
| Drive-backed notes; historical `notes-120` / `notes-210` | `notes-300`, Track T6 | Related provider/destination work for notes-100 discussion and portable discussion context. | Check existing NotesProvider/sidecar plans against audience and source-version requirements before specifying new infrastructure. |

For each existing story, record its canonical issue/feature ID, historical alias, current UX and acceptance, matching feature-prefixed story/task requirements, retain/extend/replace disposition, and remaining work. Preserve existing epic ownership where appropriate; link Sharing and Versions dependencies. Use the existing notes-100 epic code for the basic workflow. The agreed Notes title and hierarchy normalization is applied under #670; the pilot records the milestone crosswalk and deferred ownership decisions. New stories and scope changes still require the missing-work and duplicate analysis.

## Existing UX gap analysis

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

## Decisions

| Decision | Starting position for discussion |
|---|---|
| Notes discussion history | Proposed: a live discussion attached to an immutable model version, with timestamps. Decide whether any workflow also needs a frozen discussion snapshot. |
| Notes permissions and destination | Audit current create/reply/edit/delete permissions first; decide any changes and who may manage tags. Reuse existing Notes/GitHub integration only with accurate audience disclosure; a public issue is not an unlisted thread. Model-write access must not be assumed necessary for commenting. |
| Topic taxonomy | Selecting existing colored tags is in scope. Decide the initial tag set and who can create, rename or recolor shared tags. |
| Draft persistence and anonymous authors | Initial proposal: logged-in authors have device-local drafts. Decide autosave behavior, anonymous drafting and any cross-device draft sync; no public draft upload is implied. |
| Notes across model versions | Initial behavior: retain the original version and flag missing anchors. Decide whether explicit carry-forward or re-anchoring belongs in the next Notes delivery or a later enhancement. |
| Notes destinations for external inputs | Decide the default notes destination and fallback when the source repository has issues disabled or does not permit this user to comment. Do not require model republication as the workaround. |

- [ ] Reconcile the existing Notes and placemark stories with notes-100, including existing edit/delete actions, legacy links and 100–200-level aliases.

- [ ] Walk through draft saving, reload/offline, account switching, publication/reply retries, topic filters and old-version anchors on desktop/mobile.

- [ ] Resolve the notes destination/audience contract with Sharing and version/GLB anchors with Versions; document migration or justified breaking changes before assigning implementation work.
