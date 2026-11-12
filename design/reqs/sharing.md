# Sharing UX Requirements Draft

**Draft v0.6 · 2026-11-11 · share-200 · Target UX**

Sharing lets an author publish an exact model version, disclose its audience and content, and send an unguessable link that opens the intended version and view. It also lets viewers link an externally hosted revision without copying the model. This document owns publication, link access, recipient opening and sharing recovery; Versions owns history and revision identity, and Notes owns discussion authoring and organization.

The [UX index and shared requirements](README.md) define the Epic → Story → Task rubric, shared acceptance constraints and cross-feature decisions. The agreed canonical scheme uses roadmap epic codes and existing GitHub issue numbers for stories; see the index. This document’s S/V codes remain temporary locators until its triage. Notes has moved to notes-100, with its former N17–N20 aliases recorded in the pilot crosswalk. Each story includes its tasks and acceptance criteria. Cross-document dependencies refer to the owner listed in the index.

**Related requirements:** [Versions](versions.md) (V21, V01–V03, V09, V11; later V13–V16) · [Notes](notes.md) (notes-100).

## Epic and scope

**As a model author or reviewer, I want to share an exact model version and its supported view with a clear audience, so that recipients can reliably open the context I intended.**

The local-author journey is: save a local model → retain another version → choose a destination supporting unlisted sharing → review the “Anyone with the link” audience and included content → publish → copy an opaque version link → a recipient with the link opens without login → the author publishes an update → the recipient chooses whether to open it.

**Core Versions and sharing acceptance:** An author saves two IFC or STEP versions and publishes them. A recipient in a clean browser, without signing in, opens the first version and the intended supported view. After the author publishes a newer version, the original link still opens the first; the recipient can deliberately open the newer one. Interrupted saves or publications preserve completed work and never produce a false success. Also open an IFC or STEP file with two existing GitHub revisions, using an account without model-write access or anonymously for a public file. Share its older revision without uploading a copy, advance the upstream branch, and verify that the older link still identifies the same file revision while the source remains available. New copied links contain unpredictable tokens rather than repository paths or sequential IDs. A valid link opens without login; guessed tokens reveal no model metadata. The application does not list or index these shares publicly.

Publication through Share makes the selected original source content available to anyone holding the link, using an unlisted destination. Opening or linking an already-hosted version reads from its existing source and does not itself publish a copy or change the source’s visibility.

- Named-person private sharing, invitations, grant/revoke controls and folder boundaries remain with their existing epics, including share-201.

- Live co-editing, presence, rooms, new billing rules and guaranteed permanent hosting are outside this epic.

Versions and Notes retain their existing feature/story ownership. The share-200 technical proposal and planning PR coordinate the integration; this split does not assign all history or discussion requirements to Sharing. Named-person grants remain share-201.

## Anyone with the link and discoverability

**The default sharing experience is “Anyone with the link can view”.** Share generates an opaque UUID-style token that is computationally infeasible to guess by brute force. Holding the link allows reading the shared version and its included published discussion without a login; it does not grant model-editing or commenting permission. A recipient may forward the link, and the next holder gets the same read access.

| Visibility | What the user can rely on |
|---|---|
| Anyone with the link | Share does not offer a public directory, searchable listing or enumerable identifier for this share. The holder can view the explicitly shared content without signing in. |
| Public at source | The model or discussion is already public and may be discoverable at its upstream host, such as a public GitHub repository or issue. The Share link remains opaque, but does not conceal or privatize that source. |
| Restricted at source | An opaque navigation link does not bypass upstream authorization. The recipient still needs source access; this must not be labeled anonymous “Anyone with the link” unless an owner explicitly enables a supported access path. |

**Link contract:** The copied URL contains a cryptographically random identifier, not an encoded repository path, sequential record number, filename or predictable hash of public information. UUIDv4-class entropy or stronger is required: at least 122 independently random bits, generated with a cryptographically secure random source. A UUID-looking string or Base64 encoding alone does not satisfy this requirement. Internal resolution binds the token to an immutable version and the declared content scope; reformatting the token must never select another record.

**Not publicly discoverable:** Do not expose issued tokens through public APIs, sitemaps, search, galleries, unprotected history listings or topic-tag directories. Apply noindex behavior to share pages and previews, suppress token-bearing referrer leakage, and redact bearer tokens from analytics, diagnostics and public repository/issue content. Rate-limit abusive resolution attempts; malformed or unknown tokens return a generic unavailable-link result with no model name, source locator, thumbnail or notes. Noindex discourages indexing but is not access control or a guarantee against a recipient publishing the link elsewhere.

**Protect the complete path:** Unlisted hosting must not expose the same model, source metadata or notes through a browsable public index or predictable alternate URL. Blob and notes access must preserve the declared audience, using equally unguessable access or an authorized fetch path. A public GitHub repository, dataset listing or public issue cannot satisfy the unlisted-content promise merely because Share puts a random URL in front of it. For already-public external content, clearly show “Public at source”; do not claim it became unlisted.

**Scope and version:** The link opens its original version, even after updates. Disclose whether it also permits browsing model history or the published discussion; do not grant unrelated models, unpublished drafts or undeclared versions. New-version discovery reveals only content already in that link’s declared scope or independently accessible at the source. A note link must carry a valid share capability or its own equally unguessable scoped token; guessing a note number does not grant access.

**Design consequence:** The technical design must add durable opaque-link resolution and reconcile its proposed raw repository/commit URLs, public hosting and public GitHub Issues with this contract before implementation. Existing direct-source routes can remain supported as source navigation, but new Copy link actions produce opaque Share links. Creating an opaque mapping does not require re-uploading an external model. “Anyone with the link” describes access, not encryption, named-recipient confidentiality or guaranteed recall of downloaded copies.

- **Link assurance:** Before release, review the cryptographically secure token generator and entropy, test malformed/unknown tokens and abuse limits, and verify that listing, preview, metadata, blob and note endpoints do not enumerate or bypass unlisted shares. Verify noindex/referrer controls and token redaction. A few unsuccessful guesses or a UUID-shaped sample do not establish brute-force resistance.

## Sharing stories

### S04 Choose the publishing identity and destination

**As a logged-in user, I want to choose which connected account and destination publish my model, so that I do not share it under the wrong identity or in the wrong place.**

**Tasks**

- [ ] Show the active publishing account and selected destination before any upload.

- [ ] Let me connect or switch a supported account and return to the same pending publication.

- [ ] Check write access and whether the destination supports “Anyone with the link” without a browsable public index or predictable alternate access; explain unsupported destinations. For an already-public external source, disclose Public at source instead of promising unlisted source content.

- [ ] Reconnect an expired account without discarding the selected model and completed local versions.

- [ ] Identify where the model files and version history will be hosted, including any applicable limits or charges before confirmation.

**Acceptance:** With two connected accounts, selecting one results in publication to its chosen destination. An unauthorized destination produces a recoverable refusal and no silent account substitution.

**Dependencies:** A local version from V01/V03 or an external revision explicitly selected for republication under V21; the provider and account-setup flow must be selected before implementation. No destination’s visibility is broadened implicitly. This flow is not required merely to view or link an existing external version.

### S05 Understand and confirm who can access the share

**As a logged-in user, I want to review what anyone holding the link can access before I publish, so that I can make an informed sharing decision.**

**Tasks**

- [ ] Show the “Anyone with the link can view” audience, selected model version, file size, destination, acting account, and any earlier versions included in the publication. Separately identify the included published discussion or note snapshots and any Public at source visibility; private drafts are never included. For an imported external version, show the original source and that this action publishes a copy; source access alone does not imply permission to republish.

- [ ] State that the full original source file, properties and hidden content are accessible to link holders; the current view does not redact the source. Disclose separately if the source is already publicly discoverable upstream.

- [ ] Explain that link holders do not need an account, can forward the link, and may retain downloaded copies. Unlisted does not mean restricted to the people I personally send it to.

- [ ] Present the actual hosting retention and availability terms without implying unlimited or permanent storage.

- [ ] Require an explicit confirmation covering the complete sharing scope before uploading model content for access by anyone holding the link.

- [ ] Allow cancellation before confirmation with no upload; do not inherit consent from opening a file, saving locally, or a request to an AI assistant.

**Acceptance:** Cancel at confirmation and verify that no sharing upload began. Confirm publication and verify that the disclosed model, history and discussion scope matches what the link holder can access. A person without the link cannot discover the share through the app’s public surfaces. For a publicly hosted external source, the confirmation accurately discloses Public at source. Private drafts remain private.

**Dependencies:** S04. The default extent of published history is an open decision.

### S06 Publish a version and obtain a working link

**As a logged-in user, I want to see publication progress and receive a usable link only when publication succeeds, so that I can confidently send it to someone else.**

**Tasks**

- [ ] Distinguish preparation, upload, finalization and completion, with useful progress rather than an indefinite success-looking state.

- [ ] Allow cancellation and retry; explain that cancelling an upload already in progress cannot guarantee removal of bytes already exposed or downloaded.

- [ ] Preserve local versions and completed transferable work across recoverable interruption or reconnect.

- [ ] Enable copying the new opaque link only after the version, required model data and durable token-to-version mapping are ready for the declared audience.

- [ ] On an uncertain result, determine whether publication completed before retrying, avoiding duplicate versions or false failure.

- [ ] Keep previously published version links available even when a later publication fails. Model publication and note publication have separate outcomes: a failed note publish does not invalidate a working model link or appear as a successful note.

**Acceptance:** Interrupt publication, recover, and copy the completed link. A separate signed-out browser can open it. During the interruption, no unfinished version is offered as successfully shared. An interrupted request must not expose a half-created share mapping or cause a guessed token to reveal metadata.

**Dependencies:** S04–S05. Retry may resume or safely restart according to the selected provider’s capabilities.

### S07 Open an exact shared version without signing in

**As an anonymous recipient, I want to open a shared model link without creating an account, so that I can inspect exactly the version the sender intended.**

**Tasks**

- [ ] Open a valid “Anyone with the link” URL without a login, upgrade, local-save or re-upload gate. Opaque links to already-public external GitHub revisions also open anonymously; restricted upstream sources retain their access requirements.

- [ ] Show the model name, originating source, exact version identity and loading progress.

- [ ] Load the version named by the link even if the publisher has since added another version.

- [ ] Make the usual supported viewing, navigation, selection and property inspection available once the model is loaded.

- [ ] Refuse corrupted or incomplete model content with a recoverable error rather than presenting a different or partially trusted version as correct.

- [ ] Let holders of a valid shared link read its included published notes and follow anchors without login; sign-in and notes permissions are required only for contribution. A notes-service outage must not prevent an otherwise available model from opening.

**Acceptance:** Open a link in a clean signed-out browser and verify its model content. Publish another version, then reopen the original link and verify that it still identifies and opens the original version while its hosting remains available. Replace the token with an unknown or malformed value and verify a generic unavailable-link response with no model or discussion details.

**Dependencies:** S06 for a new Share publication or V21 for an already-hosted external revision. A verified GLB may provide the viewing representation for that exact source version. Show progress and any temporary limits on properties, selection or notes while required data loads; never substitute another revision or label an incomplete representation fully ready. The artifact and source-loading contract must be settled in the gap analysis.

### S08 Share an unlisted link to a specific version and view

**As a logged-in user, I want to copy an unguessable link to a specific version and its supported camera and selection state, so that anyone I send it to can open that context without making the share publicly discoverable through Share.**

**Tasks**

- [ ] Let me copy an opaque, cryptographically random Share link to the currently selected audience-accessible version, whether published through Share or already available externally. Reuse the source revision without a new upload, while creating a durable link mapping when needed.

- [ ] Make it clear whether the link includes the current camera and supported selection.

- [ ] Restore supported view state when the recipient opens the link, without changing the pinned model version.

- [ ] Explain any view state that cannot be preserved instead of claiming the recipient will see an exact replica.

- [ ] Show “Anyone with the link can view” for supported unlisted sharing, and disclose Public at source or required upstream access when applicable. Explain that selecting or hiding elements does not restrict access to the full shared source.

- [ ] Keep new share URLs free of repository paths, filenames, sequential IDs and predictable identifiers; preserve the declared model/version scope when adding view state or generating a note link. The share must not appear in public listings, search or sitemaps.

**Acceptance:** Share a version from a recognizable camera position with a supported selected element. A signed-out recipient with the opaque link opens that same version and view; the full source is accessible within the declared sharing scope. For an unlisted Share publication, verify that public discovery surfaces do not enumerate it. The note link opens its specific discussion and original version under the same audience rules. Repeat with a public GitHub commit without modifying its repository; the UI discloses Public at source.

**Dependencies:** S07 and existing view-link capabilities. Default inclusion of view state is an open decision; arbitrary display-state parity is not assumed.

### S10 Recover when another publisher gets there first

**As a logged-in user, I want my work preserved when the shared history changes during publication, so that I can recover without overwriting someone else’s version.**

**Tasks**

- [ ] Explain that another version was published and identify my retained local version and the current published version.

- [ ] Preserve both versions instead of silently overwriting or merging whole files.

- [ ] Offer an explicit supported recovery path: refresh and retry after review, or publish to a separate history.

- [ ] Keep cancellation safe, with my completed local version still available.

- [ ] When two tabs save to the same local history, show waiting or completion clearly and preserve all completed saves.

**Acceptance:** Two sessions start from the same published version and publish different replacements. The second publisher receives a recoverable conflict; the first publication and the second publisher’s local work both remain intact.

**Dependencies:** V03 and S06. Automatic semantic merge belongs to V15.

### S12 Understand why a shared version cannot open

**As a recipient, I want an actionable explanation when a shared version cannot open, so that I know whether to retry, use a local copy, update the application, or contact the sender.**

**Tasks**

- [ ] Distinguish an unavailable or deleted source revision, missing or expired source-read access, a temporary network or service limit, unsupported version format, corrupted download, and device storage or capacity limits. For a malformed or unknown Share token, show only a generic unavailable-link result; do not disclose whether a particular model exists.

- [ ] Offer only recovery actions relevant to the actual condition.

- [ ] For an authorized or successfully resolved share, keep the requested version identity visible and preserve its link for retry or contact with the sender. Do not reveal version or source details for an unknown token.

- [ ] Use an alternate source or verified local copy only when it contains the same version’s expected model data.

- [ ] Avoid blaming a malformed or unavailable shared file on the user’s model-editing actions or requiring login for an otherwise public model.

- [ ] Distinguish “model unavailable,” “notes unavailable,” “note removed or inaccessible,” and “anchor not found.” Keep any available model and note text usable, disclose cached discussion status, and preserve drafts and unsent replies for retry.

**Acceptance:** Exercise unavailable, corrupt and temporarily rate-limited sources. Each produces the appropriate recovery path, never an unrelated newer model presented as the requested one. If an upstream GitHub revision disappears or becomes inaccessible, retain its original identity and offer the relevant access/retry or retained-copy path; never fall back silently to the branch’s current version.

**Dependencies:** S07. Service wording and retries depend on the chosen host.

## Existing UX gap analysis

**Gap analysis status:** Initial observations are based on source and test definitions reviewed on GitHub `main` on 2026-11-11. Live UX walkthroughs, an exact build/commit and full issue reconciliation remain pending. An unverified capability is not necessarily missing. Use Retain, Extend/change, Verify and Decide dispositions, as defined in the index.

| Area / requirements | Existing evidence | Provisional gap or disposition | Next audit step |
|---|---|---|---|
| Sharing and source/GLB representations — S04–S08, S12 | Existing revision navigation uses source paths. This review has not established an opaque-link resolver or the complete current GLB/source-sharing flow. | **Verify + decide.** Assess the gap to unguessable, unlisted links and an exact source-to-GLB binding; do not infer either capability from navigation code. | Inventory share dialogs and endpoints; compare source and GLB identity, properties, selection and anchors. Specify included artifacts, source access, hosting and legacy-link handling. |

Audit the current share dialogs, direct-source routes, GLB/private sharing paths and any link resolver before classifying implementation gaps. Verify audience disclosure, consent, opaque token scope, no-index/discovery behavior, complete payload access, anonymous opening, cancellation and failure recovery. Notes owns the public-issue versus unlisted-discussion destination gap; Versions owns source identity and selected-history navigation.

## Decisions

| Decision | Starting position for discussion |
|---|---|
| History included in a link’s audience | Decide whether to publish the retained history or offer a selected starting version. The simple starting proposal is the visible retained history with explicit confirmation of every version included; the link must not silently expose undeclared older or newer versions. |
| Destination setup | Choose hosts that satisfy unlisted model/metadata access. The earlier public-repository/public-mirror proposal needs reconciliation; a public external source is a separately disclosed case. Then decide existing-destination selection versus guided creation. |
| View-link default | Recommend including supported current camera and selection with clear disclosure. Decide whether a separate “model only” option is needed initially. |
| Opaque link resolution | Select durable token mapping and availability behavior. Cryptographic randomness and non-enumerability are requirements, not optional encoding choices; specify link-creation authentication and failure recovery. |
| Link scope and lifecycle | Decide whether a token covers one version only or also explicitly declared history/discussion, and whether disabling, rotation or expiry ships initially. Never retarget a version link or claim revocation/expiry that the service does not implement. |

Shared decisions on GLB/source representation, supported limits and compatibility are maintained in the index. Resolve those with Versions and Notes before implementation.

## Reconciliation and acceptance

Reconcile share-200 with [#2144](https://github.com/bldrs-ai/Share/issues/2144) and [planning PR #2145](https://github.com/bldrs-ai/Share/pull/2145). The PR moves the prior grants share-200 to share-201; do not reinterpret older roadmap references without that context. Keep task checkboxes in story issue descriptions, link existing work, and create issues only after agreement.

- [ ] Complete a desktop/mobile walkthrough of publication and external-version linking, including signed-out opening and failure recovery.

- [ ] Map each Sharing task to existing behavior or an agreed implementation change; record affected legacy links and migration where a breaking change is justified.

- [ ] Verify S05/S07/S08 with Notes discussion access and Versions revision/GLB identity; update the technical design and agree the remaining work before issue creation.

Reference: [source proposal #2144](https://github.com/bldrs-ai/Share/issues/2144), [technical design](../new/model-versioning.md), and [planning PR #2145](https://github.com/bldrs-ai/Share/pull/2145).
