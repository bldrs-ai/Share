# Share 200 triage — Versions migration slice

**Reconciliation date:** 2026-11-12. **Owner:** existing [#2144](https://github.com/bldrs-ai/Share/issues/2144), now normalized to `share-200: Model versioning and sharing` with `epic` added. Its original body, checklist, open state, discussion, other labels, assignees and milestone are preserved.

The [scope snapshot](share-200.md) records only the semantic UX slice reconciled from Versions. Sharing's complete publication, audience, opaque-link and recipient stories still require their own reconciliation; this pass does not claim that work is finished.

## Ownership and tier

The roadmap and [technical design](../new/model-versioning.md) already assign the model-history proposal, including later semantic phases, to `share-200`. Reuse that owner rather than invent an epic or treat structural diff as semantic merge. Preserve the existing 2xx assignment; semantic delivery waits for the stated create-300 and measured phase gates. The source contract explicitly defers semantic editing beyond the basic whole-file journey. Future tier changes require a roadmap decision, not a complexity estimate.

| Former locator | Formal direct story | Source obligations retained |
|---|---|---|
| V13 | [#2161](https://github.com/bldrs-ai/Share/issues/2161) · Save and reopen semantic model edits | User goal, five tasks, acceptance, create-300/V1–V2 dependency and external-source provenance. |
| V14 | [#2162](https://github.com/bldrs-ai/Share/issues/2162) · Contribute to a shared model history | User goal, five tasks, acceptance, publication dependency, share-201 permission boundary and attribution limits. |
| V15 | [#2163](https://github.com/bldrs-ai/Share/issues/2163) · Resolve competing semantic edits | User goal, six tasks, acceptance, V13–V14/V3 dependency and relational validity. |
| V16 | [#2164](https://github.com/bldrs-ai/Share/issues/2164) · Continue a model round trip through another tool | User goal, five tasks, acceptance, V4/writer dependency, STEP deferral and separately agreed annotations/BCF export. |

The semantic introduction is retained in #2144, including the separation from Notes and current whole-file work. The four story bodies retain all **21 source task checkboxes**, four acceptance blocks and four dependency blocks. They add shared accessibility, desktop/mobile and failure/recovery acceptance without changing the source tasks.

## Provenance, application and verification

The [immutable Versions draft at 4458ceb](https://github.com/bldrs-ai/Share/blob/4458ceb1fadfdc8a04f04d172c63f0c63c3d777c/design/reqs/versions.md) is the source. The exhaustive audit, duplicate search, source-line ownership crosswalk, metadata-preservation checks and full hierarchy verification are recorded in [Versions 100 triage](versions-100-triage.md). #2144 had no parent or children before this migration. Its four new direct native children are formal UX stories; no planning/support issue was made a direct child.

Whole-file Versions stories stay under [#57](https://github.com/bldrs-ai/Share/issues/57). Notes stays under [#670](https://github.com/bldrs-ai/Share/issues/670). Existing `versions-300` structural diff and `versions-310` portable Drive sidecar assignments and aliases remain unchanged. Semantic history preserves its upstream identity and must consume create-300's authoritative document operations instead of inventing a competing op log.

The original proposal contains public-hosting, visible-URL and storage assumptions that differ from the target UX. The appended live issue contract makes the UX authoritative and owns technical reconciliation before implementation. This is documentation and issue organization; no runtime walkthrough, semantic acceptance, writer support or infrastructure readiness is claimed.
