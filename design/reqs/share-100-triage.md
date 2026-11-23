# Share 100 triage

**Reconciliation date:** 2026-11-23. **Evidence commit:** [`3ab35f0`](https://github.com/bldrs-ai/Share/commit/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479). **Result:** one epic issue created; no story placed. No runtime acceptance is claimed. The [rubric](ux-rubric.md) sets the procedure.

## Epic, tier and aliases

The roadmap's §3.1 row for `share-100` linked no issue. [#2284](https://github.com/bldrs-ai/Share/issues/2284) was created on 2026-11-23, labelled `epic` and `enhancement`. No code or band changed; `share-100` has not been renumbered ([ID lineage](../roadmap.md#id-lineage)).

## Inventory

Searched on 2026-11-23, `repo:bldrs-ai/Share is:issue`: `share-100`, `"Share 100"`, `Share in:title dialog` and `"Share link"`. Matches were epics and stories of other features, the share-dialog bugs #184 and #185 (closed), and the GLB export stories under `share-140`. No issue describes the dialog as a story. No result set was marked incomplete.

## Placement

| Issue | Decision |
|---|---|
| #184, #185 (closed share-dialog bugs) | Unchanged, as history. |
| Everything else found | Owned by the epic named in the snapshot's table; unchanged. |

No title, label or parent changed.

## Evidence

Pinned to `3ab35f0`; test definitions read, no test run. "Not under `describeMobileAndDesktop`" means the spec has no `[mobile]` variant; it doesn't show the flow fails on a phone.

- [liveViewLink.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Share/liveViewLink.spec.ts), [shareDisplay.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Share/shareDisplay.spec.ts) and [shareLocalFile.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Share/shareLocalFile.spec.ts): desktop and mobile.
- [ShareableCamera.spec.ts](https://github.com/bldrs-ai/Share/blob/3ab35f04bf47ecd3465c0d0a25dd4f62a4d18479/src/Components/Share/ShareableCamera.spec.ts): not under `describeMobileAndDesktop`.

## Decisions left open

- Whether to write the dialog story now or leave it pending until `share-120` and `share-130` land ([#2284](https://github.com/bldrs-ai/Share/issues/2284)).

## Milestone hypothesis

None of these is instrumented yet. Measurement plans belong in bizdev, per the [rubric](ux-rubric.md#where-each-kind-of-work-lives).

| Epic | Hypothesis | Metric | Test | Estimate |
|---|---|---|---|---|
| `share-100` | MVP. Shared links are the earned channel; a link that opens the intended view brings new visitors straight to a model. | Shared-link opens by new visitors, and their rate of reaching a displayed model. | Correlational, by link source. | Not instrumented. |
