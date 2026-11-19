# Share 200 triage — Versions and Sharing migrations

**Reconciliation date:** 2026-11-12. **Owner:** existing [#2144](https://github.com/bldrs-ai/Share/issues/2144), now normalized to `share-200: Model versioning and sharing` with `epic` added. Its original body, checklist, open state, discussion, other labels, assignees and milestone are preserved.

This record covers two migrations into `share-200`: the semantic slice from the Versions draft (2026-11-12, below) and the whole-file sharing stories from the Sharing draft (2026-11-18, [last section](#sharing-ux-draft-migration--2026-11-18)). Both are complete as migrations; neither claims the work is built. The [scope snapshot](share-200.md) covers both.

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

## Sharing UX draft migration · 2026-11-18

The Sharing UX draft (`design/reqs/sharing.md`, [retired at 587c7e1](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md)) moved into issues on 2026-11-18. Its stories split between two epics by what they're about: publishing and opening exact versions stay with `share-200` (#2144); who can open a share, the link itself and what a recipient is told belong to `share-130` (#2206, decided 2026-11-18). The duplicate search (publish, share link, unguessable or opaque link, private link, opening a shared model) found no existing story for any of them; `share-120` (#1421) owns the Share and sign-in dialog, and #2212 links it. Story bodies keep every source task, acceptance and dependency; a few long tasks were split into two checkboxes. The former S codes are aliases only, recorded here.

| Source | Content | Now owned by |
|---|---|---|
| [L1–L9](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L1-L9) | Header and document purpose | Retired; ownership is now the issues below. |
| [L11–L25](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L11-L25) | Epic goal, journey, end-to-end acceptance, scope boundaries | [#2144](https://github.com/bldrs-ai/Share/issues/2144) §"Whole-file sharing: the journey and the rules for every story". |
| [L27–L47](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L27-L47) | Visibility table and "Anyone with the link" contract | Visibility table: [#2206](https://github.com/bldrs-ai/Share/issues/2206) §"Rules for every story". Token, discovery, full-path and scope rules: [`model-versioning.md` §5a](../new/model-versioning.md#5a-share-link-contract-binding-ux-requirement). |
| [L51–L69](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L51-L69) | S04 choose the publishing identity and destination | [#2211](https://github.com/bldrs-ai/Share/issues/2211) |
| [L71–L91](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L71-L91) | S05 understand and confirm who can access the share | [#2212](https://github.com/bldrs-ai/Share/issues/2212) |
| [L93–L113](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L93-L113) | S06 publish a version and obtain a working link | [#2213](https://github.com/bldrs-ai/Share/issues/2213) |
| [L115–L135](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L115-L135) | S07 open an exact shared version without signing in | [#2214](https://github.com/bldrs-ai/Share/issues/2214) |
| [L137–L157](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L137-L157) | S08 share an unlisted link to a version and view | [#2215](https://github.com/bldrs-ai/Share/issues/2215) |
| [L159–L177](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L159-L177) | S10 recover when another publisher gets there first | [#2216](https://github.com/bldrs-ai/Share/issues/2216) |
| [L179–L199](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L179-L199) | S12 understand why a shared version cannot open | [#2217](https://github.com/bldrs-ai/Share/issues/2217) |
| [L201–L209](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L201-L209) | Gap analysis | The audit of share dialogs, routes and GLB paths was done on 2026-11-18 and recorded in `share-t101` [#2201](https://github.com/bldrs-ai/Share/issues/2201) and `share-t100` [#2203](https://github.com/bldrs-ai/Share/issues/2203); acceptance walkthroughs stay with each story. |
| [L211–L221](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L211-L221) | Decisions table | Each row moved to the story it decides: history in a link's audience → [#2212](https://github.com/bldrs-ai/Share/issues/2212); destination setup → [#2211](https://github.com/bldrs-ai/Share/issues/2211); opaque link resolution → [#2213](https://github.com/bldrs-ai/Share/issues/2213); view-link default, and link scope and lifecycle → [#2215](https://github.com/bldrs-ai/Share/issues/2215). |
| [L223–L232](https://github.com/bldrs-ai/Share/blob/587c7e1e7ae464213fa4108802a529044eddbb54/design/reqs/sharing.md#L223-L232) | Reconciliation tasks | Done by this migration, except the desktop and mobile walkthrough, which is the epic's end-to-end acceptance. |

`share-110` (Drive Save, #2205) had no story in the draft; its stories are still to be written.
