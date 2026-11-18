# Open 210

**Epic:** [open-210: View several models together · #2192](https://github.com/bldrs-ai/Share/issues/2192) · **Scope snapshot: 2026-11-18**

## Motivation

A building is rarely one file. The architecture, structure and services usually come as separate models, and a large project can be split into several buildings. People reviewing a project need to see those models together, placed where they belong, to understand the whole, and to tell which model a given element comes from. Share has opened one model at a time since `open-100`. Since the 2026-11-18 workspace decisions ([workspace.md](workspace.md)), the place where several models meet is a session: a conversation thread that names the project models it works on.

The journey is **open a session with models A and B → see them placed together → show, hide or fade each as a layer → select and inspect across models → resume the session as it was left**. A model opened on its own still shows alone, with no session. Starting and resuming sessions is `assist-310` ([#1659](https://github.com/bldrs-ai/Share/issues/1659)), and the project and session list is `open-200` ([#1657](https://github.com/bldrs-ai/Share/issues/1657)). This epic covers only what the view shows once a session holds two or more models.

## UX stories

#2192 has one formal story as its direct sub-issue:

| Story | User goal |
|---|---|
| [View a session's models together · #1251](https://github.com/bldrs-ai/Share/issues/1251) | See a session's models in place, as layers to show, hide or fade, with selection and properties naming the model. |

Further stories are added when the journey is split, after a duplicate search. The likely splits are placement, layers, and selection across models.

## Linked, not owned here

- **`open-205`** ([#2011](https://github.com/bldrs-ai/Share/issues/2011)) owns the groundwork: [#2024](https://github.com/bldrs-ai/Share/issues/2024) (model ids, one engine per model, the per-model store) and bug [#1778](https://github.com/bldrs-ai/Share/issues/1778). No story here can be built before #2024 is done.
- **Model-qualified refs** ([workspace-sessions.md §6](../new/workspace-sessions.md#6-refs-tools-and-edits-across-models)) name the model in selection, in `#d:` hide and isolate, and in the assistant's tools. The separator has not been picked yet.
- **`view-140`** ([#1705](https://github.com/bldrs-ai/Share/issues/1705)) owns the display controls and the `#d:` token; **`share-200`** ([#2144](https://github.com/bldrs-ai/Share/issues/2144)) owns the version of each model that a session pins.

**Milestone:** post-MVP (roadmap §8). This snapshot makes no claim that the milestone is right; the hypothesis and its metric are in the [triage record](open-210-triage.md), together with aliases, the inventory and the milestone audit. Current tasks, progress and open decisions live in [#2192](https://github.com/bldrs-ai/Share/issues/2192) and [#1251](https://github.com/bldrs-ai/Share/issues/1251). Revise this dated snapshot only when the motivation or the story list changes; Git history keeps earlier versions.
