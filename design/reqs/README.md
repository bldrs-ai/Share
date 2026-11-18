# Share UX Requirements Index

**Draft v0.9 · 2026-11-18 · Index and shared requirements**

## Feature documents

| Document | Owns | Epic assignments and temporary references |
|---|---|---|
| [Sharing — live requirements](https://github.com/bldrs-ai/Share/issues/2144) | Publishing exact versions, opening them without signing in, recovering from publish failures | `share-200` (former S04, S06, S07, S10); [snapshot](share-200.md) |
| [Share audience and links — live requirements](https://github.com/bldrs-ai/Share/issues/2206) | Who can open a share, unguessable links to a version and view, why a share won't open | `share-130` (former S05, S08, S12); [snapshot](share-130.md) |
| [Versions — live requirements](https://github.com/bldrs-ai/Share/issues/57) | External revisions, history, local retention, updates and backup | `versions-100` (former V21, V01–V03, V09, V11) |
| [Later semantic workflows — live requirements](https://github.com/bldrs-ai/Share/issues/2144) | Semantic persistence, contribution, conflict resolution and authoring-tool round trips | Existing `share-200` (former V13–V16); separate from structural diff and portable Drive sidecars |
| [Notes — live requirements](https://github.com/bldrs-ai/Share/issues/670) | Anchored discussions, private drafts, publication/replies and colored topic tags | `notes-100` (former N17–N20) |
| [Workspace](workspace.md) | Projects, their models and sessions; a session as a conversation thread over several models; viewing them together | `assist-300` (#1657), `assist-310` (#1659), `open-210` (#2192), reconciled 2026-11-18 |

Sharing's requirements moved into issues on 2026-11-18: [#2144](https://github.com/bldrs-ai/Share/issues/2144) and [#2206](https://github.com/bldrs-ai/Share/issues/2206), with the link contract in `design/new/model-versioning.md` §5a and the migration record in [share-200-triage.md](share-200-triage.md#sharing-ux-draft-migration--2026-11-18). Versions requirements, tasks and decisions now live in [#57](https://github.com/bldrs-ai/Share/issues/57) and its stories; the [Versions snapshot](versions-100.md) and [triage record](versions-100-triage.md) preserve scope and migration evidence. Later semantic requirements retain their existing owner [#2144](https://github.com/bldrs-ai/Share/issues/2144), with a [scope snapshot](share-200.md) and [triage slice](share-200-triage.md). Notes requirements remain in [#670](https://github.com/bldrs-ai/Share/issues/670) and its stories; its [snapshot](notes-100.md) and [triage](notes-100-triage.md) retain their established scope and history. This index owns common requirements and cross-feature decisions. The workspace's stories live in [#1657](https://github.com/bldrs-ai/Share/issues/1657), [#1659](https://github.com/bldrs-ai/Share/issues/1659) and [#2192](https://github.com/bldrs-ai/Share/issues/2192); [workspace.md](workspace.md) keeps their shared decisions and rules, and each epic has a snapshot and triage record ([assist-300](assist-300.md), [assist-310](assist-310.md), [open-210](open-210.md)). Sharing's wider reconciliation remains pending.

This document describes the next version of Share’s existing Versions, sharing and Notes experience. Users can open model versions supplied by external sources such as GitHub; model authors can retain a local history and publish exact versions through Share. Collaborators can revisit the same version and view through an opaque, unguessable Share link, and discuss the model through the existing anchored Notes experience, extended with New, Draft and Published states and colored topic tags. The sharing experience is “Anyone with the link”, without a public listing or search discovery; an externally public source retains its own visibility. Later semantic editing lets collaborators contribute reviewable model changes without losing one another’s work.

These are proposed requirements for the complete target UX, including existing behavior and extensions. They describe the evolution of Versions and Notes; an unchecked task does not mean the capability is absent today. The gap analysis below will establish the implementation delta, including justified changes to early UX approaches. Once agreed, the technical design must satisfy these outcomes; storage and transport choices do not substitute for them. Whole-file IFC and STEP versioning, unlisted sharing and the Notes requirements form the target experience; semantic editing and merging remain later work. Delivery may be staged by verified gaps without treating existing capabilities as wholly new features.\
\
Model versions may be supplied from external inputs, for example versions from GitHub that are viewed in Share.

Reference: [source proposal #2144](https://github.com/bldrs-ai/Share/issues/2144), [technical design](../new/model-versioning.md), and [planning PR #2145](https://github.com/bldrs-ai/Share/pull/2145).

The 900 MB IFC is a large-model validation case, not a promise that every device supports that size. Supported device and browser limits must be established before release.

## Rubric and future GitHub structure

Use the [standard UX rubric](ux-rubric.md) for Epic → Story → Task structure, feature-tier codes, triage dispositions and issue normalization. Stories use their epic prefix plus a user-visible title; the GitHub issue number identifies the story, and tasks remain checkboxes in its body.

Sharing, Versions and Notes have all adopted the epic scheme, keeping existing stories and roadmap aliases. Former S, V and N codes are aliases only: they resolve through the crosswalks in [share-200-triage.md](share-200-triage.md#sharing-ux-draft-migration--2026-11-18), [versions-100-triage.md](versions-100-triage.md#requirements-migration-and-source-ownership) and [notes-100-triage.md](notes-100-triage.md).

## Feature tier and issue reconciliation pilot

The [Notes 100 snapshot](notes-100.md) is a dated one-page account of the epic's motivation and formal UX stories. The separate [Notes 100 triage record](notes-100-triage.md) holds scope decisions, the issue crosswalk, milestone audit and acceptance evidence. Current delivery state lives in [#670](https://github.com/bldrs-ai/Share/issues/670) and its story issues.

Use `<epic-code>.md` for each epic's infrequently revised scope snapshot and `<epic-code>-triage.md` for its reconciliation record. Date material scope changes so Git history shows how the feature evolved; keep task progress and other frequently changing state in issues.

### Issue normalization, including milestones

Follow the [shared normalization procedure](ux-rubric.md#issue-normalization-including-milestones). Only formal UX stories are direct epic sub-issues; preserve milestones as historical references and keep issue state, UX coverage and verification evidence separate.

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

Each feature's mapping from stories and tasks to existing behavior, agreed changes or deferred decisions, and its acceptance walkthroughs, are tracked in its epic issue (#2144, #2206, #57, #670), not here.

## Shared decisions

| Decision | Starting position for discussion |
|---|---|
| Device and service limits | Set supported browsers, model-size/storage limits, upload limits, retention and measured responsiveness budgets before claiming release readiness. |
| GLB and source representation | Define which artifacts publication includes, how a derived GLB binds to the exact IFC/STEP revision, and how properties, selection, note anchors and source access remain consistent. Preserve source access promised by the whole-file stories; any separate GLB-only experience needs explicit scope and limitations. |
| Compatibility and early UX shortcomings | Decide which existing approaches to retain, extend or deliberately replace. Record breaking changes with user impact and migration/recovery behavior; the target UX may justify moving beyond the early Versions/Notes implementation. |
