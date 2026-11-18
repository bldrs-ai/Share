# Versions 100

**Epic:** [versions-100: Exact model versions and local history · #57](https://github.com/bldrs-ai/Share/issues/57) · **Scope snapshot: 2026-11-12**

## Motivation

Model reviewers and authors need to return to the model they actually inspected, with its origin and discussion intact. Versions builds on Share's existing GitHub file history and revision navigation. A repository can contain many models; viewing one file at an existing revision requires source-read access, without importing a history, uploading a copy or obtaining model-write access.

The basic journey is **open an exact revision → inspect its identity and history → retain it explicitly if wanted → revisit it → deliberately open a newer revision**. Authors can create a local history, add a replacement and make a usable personal backup. Local saving, temporary caching, remote availability and publication have distinct meanings. Sharing supplies opaque exact-version links and publication; Notes retains each discussion's original version and anchor. Moving branches and tags help discover versions, while immutable identities pin what was opened.

## UX stories

The linked formal stories include the existing journeys and their focused extensions. Their issue bodies own tasks, acceptance and unresolved decisions.

| Story | User goal |
|---|---|
| [Open an external revision · #850](https://github.com/bldrs-ai/Share/issues/850) | Inspect and link an existing source revision without importing or republishing it. |
| [Open a specific GitHub version · #1154](https://github.com/bldrs-ai/Share/issues/1154) | Select a revision through the established GitHub timeline journey. |
| [Save a first local version · #2157](https://github.com/bldrs-ai/Share/issues/2157) | Retain an exact model on this device without publishing it. |
| [Browse and reopen history · #2158](https://github.com/bldrs-ai/Share/issues/2158) | Choose an external or retained version and understand its availability. |
| [Add a replacement version · #950](https://github.com/bldrs-ai/Share/issues/950) | Add changed content to the intended history while preserving prior versions. |
| [Choose how a dropped file opens · #934](https://github.com/bldrs-ai/Share/issues/934) | Distinguish updating an existing model from opening a new one. |
| [Discover newer versions deliberately · #2159](https://github.com/bldrs-ai/Share/issues/2159) | Open an update by choice while the earlier version and Notes stay pinned. |
| [Protect local work and back it up · #2160](https://github.com/bldrs-ai/Share/issues/2160) | Understand local-only work, preserve it during cache cleanup and restore a usable backup. |
| [Save a model to GitHub · #887](https://github.com/bldrs-ai/Share/issues/887) | Save through the actual destination capability with truthful publication and recovery states. |
| [Save to a GitHub repository · #980](https://github.com/bldrs-ai/Share/issues/980) | Retrieve a model saved through the established repository/folder journey. |
| [Replace a GitHub file · #1160](https://github.com/bldrs-ai/Share/issues/1160) | Save a replacement through the established GitHub-file journey. |
| [Delete a version · #890](https://github.com/bldrs-ai/Share/issues/890) | Manage removal with explicit retention, permission and recovery consequences. |

This snapshot makes no completion claim. Anonymous local-saving policy and deletion effects remain explicit issue decisions. Structural diff (`versions-300`), portable versions for Drive (`versions-310`) and [later semantic workflows](share-200.md) retain their separate ownership.

The [triage record](versions-100-triage.md) preserves aliases, milestone evidence and the retired draft's ownership crosswalk. Current delivery state lives in [#57](https://github.com/bldrs-ai/Share/issues/57) and its stories. Revise this dated snapshot only when motivation or story scope materially changes; Git history retains earlier versions.
