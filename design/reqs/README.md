# Share UX Requirements Index

**Draft v0.7 · 2026-11-12 · Index and shared requirements**

## Feature documents

| Document | Owns | Epic assignments and temporary references |
|---|---|---|
| [Sharing](sharing.md) | Publication, audience, unguessable links, recipient opening and sharing recovery | S04–S08, S10, S12 |
| [Versions](versions.md) | External revisions, history, local retention, updates and backup; later semantic version workflows | V21, V01–V03, V09, V11; later V13–V16 |
| [Notes](notes.md) | Anchored discussions, private drafts, publication/replies and colored topic tags | `notes-100` (former N17–N20) |

Each feature document is the source of truth for its stories, decisions and gap analysis. This index owns only the common requirements and cross-feature decisions. Versions and Notes include starting maps to existing features and historical IDs; the Notes pilot now records the applied issue hierarchy, while wider reconciliation remains pending.

This document describes the next version of Share’s existing Versions, sharing and Notes experience. Users can open model versions supplied by external sources such as GitHub; model authors can retain a local history and publish exact versions through Share. Collaborators can revisit the same version and view through an opaque, unguessable Share link, and discuss the model through the existing anchored Notes experience, extended with New, Draft and Published states and colored topic tags. The sharing experience is “Anyone with the link”, without a public listing or search discovery; an externally public source retains its own visibility. Later semantic editing lets collaborators contribute reviewable model changes without losing one another’s work.

These are proposed requirements for the complete target UX, including existing behavior and extensions. They describe the evolution of Versions and Notes; an unchecked task does not mean the capability is absent today. The gap analysis below will establish the implementation delta, including justified changes to early UX approaches. Once agreed, the technical design must satisfy these outcomes; storage and transport choices do not substitute for them. Whole-file IFC and STEP versioning, unlisted sharing and the Notes requirements form the target experience; semantic editing and merging remain later work. Delivery may be staged by verified gaps without treating existing capabilities as wholly new features.\
\
Model versions may be supplied from external inputs, for example versions from GitHub that are viewed in Share.

Reference: [source proposal #2144](https://github.com/bldrs-ai/Share/issues/2144), [technical design](../new/model-versioning.md), and [planning PR #2145](https://github.com/bldrs-ai/Share/pull/2145).

The 900 MB IFC is a large-model validation case, not a promise that every device supports that size. Supported device and browser limits must be established before release.

## Rubric and future GitHub structure

- **Epic:** the overall user capability and its end-to-end acceptance journey.

- **Story:** one independently understandable user goal, written “As a …, I want …, so that …”. After reconciliation, each story maps to an existing issue or a native sub-issue of its appropriate epic.

- **Task:** a concrete, verifiable UX obligation inside that story. Tasks remain checkboxes in the story issue description. They are not separate task issues by default.

- **Acceptance:** a user action and observable result that proves the story works. Technical implementation work is mapped to these requirements separately.

Canonical feature codes follow the roadmap’s **{share,notes,versions}-{1,2,3,4}xx** epic scheme. Stories share their epic prefix in the title—for example, **notes-100: Edit a note**—and the existing GitHub issue number identifies the story (#1057). Tasks remain checkboxes in its body, referenced as #1057/T1. Do not consume a new epic number for each story or create replacement issues just to renumber them. Notes is the first migration pilot; former N17–N20 references are aliases recorded in its crosswalk. S/V references remain temporary locators until the corresponding Sharing/Versions triage.

Reconcile Sharing with #2144 and the share-200 planning PR, and reconcile Versions and Notes with their existing 100–200-level stories and later roadmap aliases. Retain appropriate epic ownership and link dependencies; do not place every feature under share-200. Reuse or link existing issues before creating new ones. Each story issue keeps its user statement, task checklist, acceptance, dependencies and unresolved decisions. Create new issues only after scope agreement and a duplicate search; preserve existing issue numbers.

## Feature tier and issue reconciliation pilot

The [Notes 100 pilot](notes-100-triage.md) applies the agreed convention to the existing story issues. Tiers encode the earliest business milestone requiring a capability, not implementation difficulty or completion state: 1xx MVP, 2xx MLP, 3xx Pro, 4xx Enterprise. Most basic workflow requirements remain 1xx. Separate later capabilities need an explicit scope and milestone rationale; existing IDs and historical aliases are preserved until deliberately reconciled.

The Notes pilot applies the agreed naming and native sub-issue hierarchy under [#670](https://github.com/bldrs-ai/Share/issues/670). Product decisions and acceptance gaps remain explicit follow-ups. Repeat this rubric for Sharing and Versions, keeping issue state, UX coverage and verification evidence separate.

### Issue normalization, including milestones

1. Inventory the feature's issues across open and closed states, labels and historical title variants. Find the existing epic/tracker before creating a parent or replacement story.
2. **Expand through milestones.** Enumerate all members of each related milestone, including closed issues and linked pull requests, and follow explicit parent/task references. Include relevant issues from broader release milestones. Record the milestone URL, source issue, proposed parent, evidence and disposition; a story-only search is insufficient.
3. Classify by user outcome and content. **Only formal UX stories are direct sub-issues of an epic.** Attach existing implementation/task/bug issues beneath their owning story where the relationship is established. Keep planning, refactoring, testing, documentation and other cross-story support work as linked references outside the epic's direct children; record any unresolved story ownership in the crosswalk. Preserve legacy task issues; new UX tasks remain checkboxes in story descriptions. Pull requests remain evidence/dependency links.
4. **Use native sub-issues uniformly as the work hierarchy.** Milestone membership is discovery evidence, not automatic ownership. Preserve milestone names, descriptions, dates, open/closed states and assignments as historical references. Keep other-epic work with its owner; record ambiguous or shared ownership as an explicit deferral with a next decision. Cross-link dependencies rather than duplicating issues or forcing a second parent.
5. Apply the agreed epic prefix and appropriate labels without rewriting historical completion or task checkboxes. Check existing parents first; retain correct links and resolve conflicts before reparenting. Verify the resulting hierarchy, preserved milestones and issue states, and record applied changes and remaining exceptions in the feature crosswalk.

Milestone completion percentages remain historical. Native sub-issue rollups describe issue state; neither proves the current UX requirements have passed acceptance.

## Shared boundaries

Logging into Bldrs and connecting a hosting account are distinct. Being logged in does not imply permission to write to a destination. Permission to publish or reply to notes is also distinct from permission to publish model versions; check the selected notes destination’s capabilities instead of assuming every commenter can write model files. Reading an externally hosted model requires source-read access only. Source reading, local saving, publishing model copies and publishing notes must each use the appropriate capability; none implies the others.

- GLB exports of IFC and STEP are a primary component of the wire format. A derived GLB represents the same identified source version; it is not a separate model history. Loading, source access, properties, selection and note placement must remain consistent across source and derived representations. The gap analysis must establish the artifact packaging and mapping needed to satisfy those UX requirements.

## Requirements shared by every story

- **Desktop and mobile:** Each UI story has a happy-path acceptance test on both form factors and tests for its material failure and recovery paths.

- **Accessible interaction:** Core actions work with keyboard and touch. Labels, progress, errors and completion are accessible to assistive technology; state is not conveyed by color alone. Colored topic tags always have readable text labels and accessible contrast; note placement and selection have a keyboard-accessible route as well as pointer/touch interaction.

- **Large-model usability:** Long operations show progress, leave controls responsive, and provide cancellation where safe. State supported device limits explicitly. A cold 900 MB source load is not subject to an invented two-second target.

- **Honest state:** Viewing an external version, caching it, saving it on this device and publishing a copy are distinguishable. Failed or incomplete work is never labeled saved or shared. Notes separately show New, saved Draft, publish progress/failure and Published. A saved draft is not a published note, and a published note is not a new model revision.

- **Stable versions:** A version link never silently points to a newer model. Internal storage maintenance cannot change a retained version’s content or meaning. A note link preserves its original version and anchor; live replies, when supported, are visibly discussion updates rather than changes to the pinned model. For external sources, pin the source file and immutable revision; moving branches/tags are discovery pointers, not stable version identities.

- **Privacy and scope:** Opening, local saving and view changes do not publish data. Sharing source content with anyone holding the link requires the explicit consent in S05. Shared pages are unlisted and marked noindex; bearer tokens and token-bearing URLs stay out of analytics, diagnostics, referrers and public source files/issues. Model names, content, note/tag text, author emails and provider credentials also stay out of diagnostic telemetry. Draft notes and unsent replies remain private; publishing a model does not grant consent to publish drafts.

- **Safe cancellation and recovery:** Completed versions survive interruption. Recovery does not silently overwrite another contributor’s work or reinterpret cancellation as successful recall of shared data or downloaded copies.

- **Existing behavior and intentional evolution:** Use current local/public viewing, Versions navigation, direct-model links, GLB/private sharing paths, and Notes discussions, replies, edit/delete actions and placemarks as the baseline. Preserve useful behavior and thread identities by default, and avoid duplicate model histories or discussions. Existing Versions and Notes are features with existing 100–200-level stories with possible significant UX shortcomings: where the target UX materially conflicts with the existing approach, a forward-moving breaking change may be appropriate. Record the affected journeys, links/data, rationale and migration or recovery path in the gap analysis before implementation; compatibility is not a blanket veto on improvement. For legacy notes lacking a verifiable immutable revision, preserve available context, disclose uncertainty and offer explicit recovery; never invent a version or silently re-anchor. External models remain viewable without conversion to Share’s version-repository layout. Existing direct-source URLs and new opaque Copy link actions have distinct roles; any intentional retirement must be documented, and compatibility must not create a predictable bypass for newly unlisted content.

## Gap analysis and issue reconciliation

**How to classify:** **Retain** means existing behavior satisfies the target and needs regression coverage; **Extend/change** means a specific difference has been identified; **Verify** means runtime or wider-source evidence is still needed; **Decide** means the product contract is unresolved. These are provisional dispositions, not completion statuses. Existing 100–200-level UX may warrant a deliberate breaking change: document the benefit, affected users/data/links and migration or recovery instead of preserving a poor approach automatically.

**Walkthrough record template:** build/commit · device/browser · source/model/route · login and permissions · story/task reference · action · observed result · target result · evidence · retain/change/new disposition · migration impact · owner and follow-up issue. Owner, build and runtime evidence are pending in the feature-specific gap analyses.

- [ ] Map every in-scope story and task to observed existing behavior, an agreed change/new capability, or an explicitly deferred decision. Retain the complete requirements even when existing code already satisfies them.

- [ ] Agree the feature-specific gaps, migration/recovery decisions and existing-issue mappings, then reconcile the technical design and acceptance coverage. Adopt the three documents as the next UX requirements version once their scope is agreed.

## Shared decisions

| Decision | Starting position for discussion |
|---|---|
| Device and service limits | Set supported browsers, model-size/storage limits, upload limits, retention and measured responsiveness budgets before claiming release readiness. |
| GLB and source representation | Define which artifacts publication includes, how a derived GLB binds to the exact IFC/STEP revision, and how properties, selection, note anchors and source access remain consistent. Preserve source access promised by the whole-file stories; any separate GLB-only experience needs explicit scope and limitations. |
| Compatibility and early UX shortcomings | Decide which existing approaches to retain, extend or deliberately replace. Record breaking changes with user impact and migration/recovery behavior; the target UX may justify moving beyond the early Versions/Notes implementation. |
