# Workspace UX Requirements Draft — projects, models and sessions

**Draft v0.1 · 2026-11-18 · New capability across `assist-300`, `assist-310` and `open-210`**

A person groups their models into projects, and works on them in sessions. A model can be opened on its own straight from its project. A session is one conversation thread, with the assistant and later with teammates, over one or more of the project's models: an analysis, a review, or a set of edits. Two sessions can use the same model without affecting each other, and a session that uses several models can show them together, as layers of one assembly.

```
Project 1
  Models
    A.ifc
    B.step
  Session 1   (A + B)
  Session 2   (A)
  Session 3   (B)
Project 2
  …
```

This page owns what the person sees and can do. The [technical design](../new/workspace-sessions.md) owns how it is built: one engine per model shared by every session that uses it, session files, and refs that name a model. The [UX rubric](ux-rubric.md) sets the epic → story → task structure; the [UX index](README.md) sets the rules every story shares (desktop and mobile, accessibility, accurate state, privacy).

## Decisions so far

- **2026-11-10:** sessions sit on the left, grouped by project, and a session's models open as tabs. This was recorded in `conversational-cad.md` §2.9, which is in draft PR #2138 and not yet on `main`.
- **2026-11-18:** a session is the conversation thread, and it names the models it works on. A model belongs to the project, not to a session: the project lists its models, and any of them opens directly. This answers §2.9's first two open questions and keeps the model list that §2.9 had removed from the drawer.

## Who owns what

Each story belongs to the epic the [roadmap](../roadmap.md) already assigns its outcome to. No new epic is created.

| Epic | Owns here |
|---|---|
| `assist-300` Workspace shell ([#1657](https://github.com/bldrs-ai/Share/issues/1657)) | The left nav: projects, their models and their sessions; opening a model directly; keeping all of it across reloads |
| `assist-310` Conversational agent panel ([#1659](https://github.com/bldrs-ai/Share/issues/1659)) | A session as a conversation thread: starting one, resuming one, what the assistant can see and do inside it |
| `open-210` Several models in one session ([#1251](https://github.com/bldrs-ai/Share/issues/1251)) | Viewing a session's models together, placed correctly, and showing or hiding each as a layer |

Linked, not owned here:
- **`open-205`** owns sharing one engine per model across tabs and sessions, and the multi-model viewer groundwork ([#2024](https://github.com/bldrs-ai/Share/issues/2024)).
- **`create-300` / `create-310`** own editing. A session's edits are stored with the session; how they are shown, undone and kept is theirs.
- **`share-200`** owns model versions. A session records which version of each model it was made against.

## Stories

Stories are written as user goals. Each becomes a native sub-issue of its epic, titled with the epic prefix. Tasks become checkboxes in that issue. **Story issue pending** means no matching issue exists yet. One would be created in the reconciliation of that epic (the next step below), after a duplicate search.

### assist-300: Browse a project's models and sessions

**As a project member, I want to see each project's models and sessions in the left nav, so that I can find the model or the piece of work I want.**

- Under each project, two groups: Models and Sessions. Empty groups say so and offer the next action (add a model, start a session).
- A session row shows its title, the models it uses, and when it was last active.
- Models and sessions outside any project have a landing place, as "Ungrouped" does today (#1692).
- Works with keyboard and touch, collapsed to a rail and on mobile, as the drawer does today (#1693, #1695).

Existing: [#1661](https://github.com/bldrs-ai/Share/issues/1661) (closed) built the drawer with project → models. **Extend:** a follow-up story adds Sessions, and keeps #1661's history. Story issue pending.

### assist-300: Open a model on its own

**As a project member, I want to open one of the project's models directly, so that I can look at it without starting a session.**

- Opening a model from the Models group shows that model alone, as opening a model does today. No conversation is created.
- The view says which project the model belongs to, and that no session is open.

Existing: the "open from the drawer" flow (#1691) under #1661. **Retain**, and clarify the "no session" state.

### assist-300: Keep projects, models and sessions across reloads

**As a project member, I want my projects, their models and their sessions to be there when I come back, so that I can continue where I was.**

Existing: [#1662](https://github.com/bldrs-ai/Share/issues/1662) (open) keeps projects locally and syncs them for logged-in users. **Extend** it to sessions. A session's conversation can be larger than the account-level sync allows; the technical design says where each part is kept.

### assist-310: Start a session on some of a project's models

**As a project member, I want to start a session and choose which of the project's models it works on, so that the assistant and I look at the same thing.**

- Start a session from a project, or from an open model, which then becomes the session's first model.
- Pick one or more of the project's models. Add or remove models later; removing a model says what happens to that session's edits to it.
- The session gets a title, editable, suggested from its first message.
- Models of other projects can't be added without first adding them to this project.

Existing: [#1672](https://github.com/bldrs-ai/Share/issues/1672) (open) plans "drawer threads". **Extend:** a thread is a session, and it lives under its project. Story issue pending, or #1672 rescoped, decided at reconciliation.

### assist-310: Resume a session

**As a project member, I want to reopen a session and find its conversation, models and view as I left them, so that I can carry on.**

- Reopening restores the conversation, the session's models (as tabs or layers), each model's view, and the session's edits.
- A model that changed since, or is no longer available, is shown as such. The session isn't silently pointed at a different version.
- A session whose models are still loading can already be read and typed into.

Story issue pending.

### assist-310: Keep sessions apart

**As a project member, I want what I do in one session to stay in that session, so that two pieces of work on the same model don't interfere.**

- Edits, hidden elements and the assistant's actions in Session 1 never appear in Session 2, even when both use model A.
- Opening model A directly always shows A itself, without any session's edits.
- A session's edits are not a new version of the model. Turning them into one is an explicit action owned by `share-200` and `create-300`.

Story issue pending.

### open-210: View a session's models together

**As a project member, I want a session's models shown together, each in its place, so that I can see the whole assembly.**

- The models are placed where their files put them; a model without usable placement can be moved and the move is saved with the session.
- Each model is a layer: show it, hide it, or show it faded while another is the focus.
- Selection, properties and hide/isolate say which model an element belongs to.
- Tabs remain available: one model per tab, or all of them together.

Existing: [#1251](https://github.com/bldrs-ai/Share/issues/1251) (open). **Retain**, and refresh its acceptance to name sessions instead of "a project". #1251's "ghosted view, fully loaded when required" is the faded layer above.

## Rules for these stories

The [shared requirements](README.md#requirements-shared-by-every-story) apply. In particular:

- **Accurate state:** a session's edits, a saved model version and a published model are three different things, and the UI never presents one as another.
- **Privacy:** a session is private to the person who made it until it is shared (sharing a session is `assist-400`). Session titles, conversation text and model names stay out of analytics and diagnostics.
- **Large models:** a session with several large models shows each model's loading progress separately, and stays usable while they load.

## Milestone hypotheses

The three epics are in the AI and post-MVP bands of the roadmap. The rubric asks for a hypothesis and a metric per epic; none is instrumented yet.

| Epic | Hypothesis | Metric |
|---|---|---|
| `assist-300` | Grouping work by project brings people back to the same models | Returning sessions per project within 7 days |
| `assist-310` | A resumable session keeps an analysis going across visits | Sessions resumed at least once |
| `open-210` | Viewing models together is why a project has more than one model | Sessions with two or more models |

## Next step

Reconcile `assist-300`, `assist-310` and `open-210` with these stories under the [rubric](ux-rubric.md#how-to-triage): search for duplicates, then create the pending stories as sub-issues and write each epic's scope snapshot and triage record. That needs the owner's go-ahead on the decisions in the technical design's §8.
