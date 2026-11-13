# Share 200

**Epic:** [share-200: Model versioning and sharing · #2144](https://github.com/bldrs-ai/Share/issues/2144) · **Scope snapshot: 2026-11-12 · Versions reconciliation slice**

## Motivation

Authors need to share an exact model version and later contribute reviewable changes without losing earlier work or another contributor's changes. The existing proposal starts with whole-file history and explicit version publication, then adds semantic editing, contribution, conflict resolution and authoring-tool round trips. An opaque version link and a derived representation must retain the same source identity; publication uses its own destination permission and audience contract.

The later journey is **edit a supported model → save the effective result → publish a contribution → review competing changes → resolve them explicitly → continue through another tool**. Camera changes and Notes discussions remain separate from document edits. Notes stays attached to its recorded model version, and the immutable external source retains its provenance.

## UX stories reconciled from Versions

| Story | User goal |
|---|---|
| [Save and reopen semantic edits · #2161](https://github.com/bldrs-ai/Share/issues/2161) | Reopen the edited state actually reviewed, including the effective undo/redo result. |
| [Contribute to a shared history · #2162](https://github.com/bldrs-ai/Share/issues/2162) | Publish supported edits with actual destination write access while preserving local work on failure. |
| [Resolve competing edits · #2163](https://github.com/bldrs-ai/Share/issues/2163) | Combine compatible work and explicitly resolve conflicts without losing either alternative. |
| [Continue through another tool · #2164](https://github.com/bldrs-ai/Share/issues/2164) | Export a supported edited model and review an externally revised model as another version. |

These four formal stories preserve the later semantic contract from the Versions draft. They depend on create-300's editing and identity substrate, measured semantic phase gates and an appropriate writer where required. STEP remains whole-file until explicitly supported. The existing `share-200` roadmap assignment is retained; complexity does not create a new tier or epic code.

This is a dated snapshot of the Versions reconciliation slice, not a complete reconciliation of Sharing. Whole-file publication and recipient requirements remain in the [Sharing draft](sharing.md) and the existing epic pending that feature's own reconciliation. Basic source opening and retained history belong to [versions-100](versions-100.md); structural diff and portable Drive sidecars retain `versions-300` and `versions-310`.

The [triage record](share-200-triage.md) records provenance and scope boundaries. Current tasks and decisions live in [#2144](https://github.com/bldrs-ai/Share/issues/2144) and its story issues. This snapshot is not a completion claim; revise and date it when motivation or story scope materially changes.
