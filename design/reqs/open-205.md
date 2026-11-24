# Open 205

**Epic:** [open-205: In-app model switching · #2011](https://github.com/bldrs-ai/Share/issues/2011) · **Scope snapshot: 2026-11-23**

## Motivation

Opening a model used to be a full page load. That kept the lifecycle simple, because the page was reset between models, but it made switching slow and blocked two things: a workspace whose left drawer moves between models ([open-200](open-200.md)), and viewing several models together ([open-210](open-210.md)). This epic is the user-visible half of removing that reload. The engine and rendering work that makes it possible is technical and lives beneath the epic and in the track `view-t100`, not as stories.

The journey is **open a second model from any surface → it opens in place, with the old model's engine freed → under the workspace, switch away from a model that is still loading and come back to it**. Without the workspace a switch still closes the old model, as the reload did, because nothing else lets a person return to a model left running.

## UX stories

#2011 has two formal stories as its direct sub-issues. Each owns its tasks and acceptance.

| Story | User goal |
|---|---|
| [Switch to another model without a page reload · #2021](https://github.com/bldrs-ai/Share/issues/2021) | Open a model from any surface in the same page, keeping one's place in the app. Done and on by default since 2026-11-19; the workspace's capture is the one task left. |
| [Leave a model loading and come back to it · #2265](https://github.com/bldrs-ai/Share/issues/2265) | Switch away from a loading model under `?feature=workspace` and find it loaded on return, within a memory budget. Not built. |

Work beneath the stories: Phase 0's per-model bugs (#2012 and its tasks), #2020, #2022, #2017 and #2028 under the switch story; per-model sessions (#2019), `EngineHost` (#2031) and the memory E2E (#2023) under the background story.

## Linked, not owned here

- **Engine and rendering work.** Interactive at the index and at first mesh (#2029, #2043), no blocking calls (#2030), the lean early tree (#2044), large uploads (#2042), the per-model engine worker (#2053), off-main-thread rendering (#2055) and the CadView split (#2250) serve this epic, `view-130` and `view-t100` together. `view-t100` has no tracking issue yet, so they stay direct children of #2011 as a recorded exception. The designs are [engine-worker.md](../new/engine-worker.md) and [offscreen-rendering.md](../new/offscreen-rendering.md).
- **Track `open-t200`** ([#2315](https://github.com/bldrs-ai/Share/issues/2315), added 2026-11-24): the cross-epic technical work behind story #2265, as one sub-issue per slice (#2316–#2328). #2031, #2019 and #2023 stay under #2265; the slices are how #2031 is built. `view-t100` got its tracking issue, [#2300](https://github.com/bldrs-ai/Share/issues/2300), on 2026-11-23, after the sentence above was written; whether the engine and rendering items move under either track is still open. Snapshot: [tracks/open-t200](../tracks/open-t200/README.md).
- **Multi-model groundwork** (#2024) is a dependency of [open-210](open-210.md), which cannot start before it.
- **`open-200`** ([#1657](https://github.com/bldrs-ai/Share/issues/1657)) owns the drawer that is the switching surface for background models, in [#1664](https://github.com/bldrs-ai/Share/issues/1664).

**Milestone:** the 2xx band, stage AI.1 in the roadmap; prerequisite of `open-200` and `open-210`. The hypothesis and metric are in the [triage record](open-205-triage.md), with the inventory and the decision log's location. The plan and the owner's decisions are in [in-app-model-switch.md](../new/in-app-model-switch.md). Current tasks, progress and open decisions live in [#2011](https://github.com/bldrs-ai/Share/issues/2011) and its stories. Revise and re-date this snapshot when the motivation or the story list changes; Git history keeps earlier versions.
