# Workspace UX requirements — projects, models and sessions

**v0.3 · 2026-11-18 · Reconciled: the stories, tasks and acceptance now live in their issues**

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

The person-facing requirements live in the three epics' stories (see [Stories](#stories)); this page keeps the decisions and rules they share, and an index of them. The [technical design](../new/workspace-sessions.md) owns how it is built: one engine per model shared by every session that uses it, session files, and refs that name a model. The [UX rubric](ux-rubric.md) sets the epic → story → task structure; the [UX index](README.md) sets the rules every story shares (desktop and mobile, accessibility, accurate state, privacy).

## Decisions so far

- **2026-11-10:** sessions sit on the left, grouped by project, and a session's models open as tabs. This was recorded in `conversational-cad.md` §2.9, which is in draft PR #2138 and not yet on `main`.
- **2026-11-18:** a session is the conversation thread, and it names the models it works on. A model belongs to the project, not to a session: the project lists its models, and any of them opens directly. This answers §2.9's first two open questions and keeps the model list that §2.9 had removed from the drawer.
- **2026-11-18:** a model opened on its own has no session; a chat icon on it starts one about that model. Sessions, like models, can sit outside any project, under Ungrouped. With the workspace turned off, Share shows today's production layout, inset in the workspace; that layout isn't designed further yet.

## Who owns what

Each story belongs to the epic the [roadmap](../roadmap.md) already assigns its outcome to. Each epic has a [scope snapshot and a triage record](#records).

| Epic | Owns here |
|---|---|
| `assist-300` Workspace shell ([#1657](https://github.com/bldrs-ai/Share/issues/1657)) | The left nav: projects, their models and their sessions; opening a model directly; keeping all of it across reloads |
| `assist-310` Conversational agent panel ([#1659](https://github.com/bldrs-ai/Share/issues/1659)) | A session as a conversation thread: starting one, resuming one, keeping sessions apart, what the assistant can see and do inside it |
| `open-210` View several models together ([#2192](https://github.com/bldrs-ai/Share/issues/2192)) | Viewing a session's models together, placed correctly, and showing, hiding or fading each as a layer |

Linked, not owned here:
- **`open-205`** owns sharing one engine per model across tabs and sessions, and the multi-model viewer groundwork ([#2024](https://github.com/bldrs-ai/Share/issues/2024)).
- **`create-300` / `create-310`** own editing. A session's edits are stored with the session; how they are shown, undone and kept is theirs.
- **`share-200`** owns model versions. A session records which version of each model it was made against.

## Stories

Each story's goal, tasks, acceptance and progress live in its issue, which is a native sub-issue of its epic. This page keeps only the goal, so links to these headings still land somewhere useful. The text this page held before reconciliation is preserved, pinned, in each epic's triage record.

### assist-300: Browse a project's models and sessions

See each project's Models and Sessions in the left nav, so the model or the piece of work you want is easy to find. **[#2193](https://github.com/bldrs-ai/Share/issues/2193)**, a follow-up to [#1661](https://github.com/bldrs-ai/Share/issues/1661).

### assist-300: Open a model on its own

Open one of the project's models directly, without starting a session; a chat icon starts one about that model. **[#1664](https://github.com/bldrs-ai/Share/issues/1664)**.

### assist-300: Keep projects, models and sessions across reloads

Find your projects, their models and their sessions when you come back. **[#1662](https://github.com/bldrs-ai/Share/issues/1662)**.

### assist-310: Start a session on some of a project's models

Start a session and choose which of the project's models it works on, so the assistant and you look at the same thing. **[#1672](https://github.com/bldrs-ai/Share/issues/1672)**.

### assist-310: Resume a session

Reopen a session and find its conversation, models and view as you left them. **[#2194](https://github.com/bldrs-ai/Share/issues/2194)**.

### assist-310: Keep sessions apart

What you do in one session stays in that session, even when another session uses the same model. **[#2195](https://github.com/bldrs-ai/Share/issues/2195)**.

### open-210: View a session's models together

See a session's models together, each in its place, as layers of one assembly. **[#1251](https://github.com/bldrs-ai/Share/issues/1251)**.

## Rules for these stories

The [shared requirements](README.md#requirements-shared-by-every-story) apply. In particular:

- **Accurate state:** a session's edits, a saved model version and a published model are three different things, and the UI never presents one as another.
- **Privacy:** a session is private to the person who made it until it is shared (sharing a session is `assist-400`). Session titles, conversation text and model names stay out of analytics and diagnostics.
- **Large models:** a session with several large models shows each model's loading progress separately, and stays usable while they load.

## Records

| Epic | Scope snapshot | Triage record |
|---|---|---|
| `assist-300` | [assist-300.md](assist-300.md) | [assist-300-triage.md](assist-300-triage.md) |
| `assist-310` | [assist-310.md](assist-310.md) | [assist-310-triage.md](assist-310-triage.md) |
| `open-210` | [open-210.md](open-210.md) | [open-210-triage.md](open-210-triage.md) |

Each triage record holds its epic's milestone hypothesis and metric (none is instrumented yet), the issue crosswalk, the milestone audit and the decisions still open.
