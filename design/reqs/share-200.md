# Share 200

**Epic:** [share-200: Model versioning and sharing · #2144](https://github.com/bldrs-ai/Share/issues/2144) · **Scope snapshot: 2026-11-18** (revises 2026-11-12)

## Motivation

Authors need to share an exact model version, so that whoever opens the link sees what was intended, and later to contribute reviewable changes without losing earlier work or anyone else's.

Two journeys, built in that order:

- **Whole-file sharing:** save a model and another version → choose where to publish → confirm who can open it → publish → copy a link → a recipient opens it without signing in → an update is published → the recipient chooses whether to open it.
- **Later semantic editing:** edit a supported model → save the result → publish a contribution → review competing changes → resolve them → continue in another tool.

Notes stay attached to the version they were written on; camera views and discussions are separate from document edits.

## UX stories

Whole-file sharing (migrated from the Sharing UX draft, 2026-11-18):

| Story | User goal |
|---|---|
| [Choose the account and destination to publish to · #2211](https://github.com/bldrs-ai/Share/issues/2211) | Publish under the right account, to the right place. |
| [Publish a version and get a working link · #2213](https://github.com/bldrs-ai/Share/issues/2213) | Get a link only once publishing has worked. |
| [Open an exact shared version without signing in · #2214](https://github.com/bldrs-ai/Share/issues/2214) | Open exactly the version the sender meant, with no account. |
| [Recover when someone else publishes first · #2216](https://github.com/bldrs-ai/Share/issues/2216) | Keep my work when the shared history changed meanwhile. |

Later semantic editing (migrated from the Versions draft, 2026-11-12):

| Story | User goal |
|---|---|
| [Save and reopen model edits · #2161](https://github.com/bldrs-ai/Share/issues/2161) | Reopen the edited state actually reviewed. |
| [Contribute to a shared history · #2162](https://github.com/bldrs-ai/Share/issues/2162) | Publish supported edits, keeping local work if it fails. |
| [Merge or resolve edits from two collaborators · #2163](https://github.com/bldrs-ai/Share/issues/2163) | Combine compatible work and resolve conflicts without losing either side. |
| [Round-trip an edited model through another tool · #2164](https://github.com/bldrs-ai/Share/issues/2164) | Export an edited model, and review one revised elsewhere as a new version. |

Who can open a share, the link itself and what a recipient is told when it won't open belong to `share-130` ([snapshot](share-130.md), #2206). The rules for copied links are in [`model-versioning.md` §5a](../new/model-versioning.md#5a-share-link-contract-binding-ux-requirement). Basic history and local retention stay with `versions-100` (#57); structural diff and portable Drive versions keep `versions-300` and `versions-310`.

This snapshot makes no completion claim; the semantic stories depend on `create-300`'s editing substrate. The [triage record](share-200-triage.md) has the provenance. Current tasks and decisions live in [#2144](https://github.com/bldrs-ai/Share/issues/2144) and its stories.
