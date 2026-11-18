# Workspace sessions — projects, models, sessions and their engines

**Status:** draft v0.2, design only; the owner's decisions of 2026-11-18 are in §8. Nothing here is built.
**Date:** 2026-11-18
**UX requirements:** [design/reqs/workspace.md](../reqs/workspace.md) (what the person sees; this doc is how it is built).
**Follows:** [reviews/2026-11-18-mvc-core-review-followup.md](reviews/2026-11-18-mvc-core-review-followup.md) §4, which this settles.
**Epics:** `assist-300` (#1657), `assist-310` (#1659), `open-210` (#2192, story #1251); depends on `open-205` (#2011), `create-300` (#1914), `share-200` (#2144).


## 1. Summary

- **A project holds models and sessions.** A model is listed once, under its project, and opens on its own. A session is a conversation thread over one or more of the project's models.
- **One engine per model, shared.** Each model that is open anywhere has one Conway engine worker, which every tab and session using that model shares. The engine never holds a session's edits: it serves the model as its file says.
- **A session is a document, not a worker.** It holds its conversation, the models it uses (each pinned to a version), how they are placed, one op log per model, and its view state. It runs on the page by default. It gets a worker only for work that needs one.
- **Edits live in the session.** Session 1 and Session 2 can both use model A and disagree about it. That only works if A's engine is untouched and each session keeps its own op log for A. This is the split the [MVC-core follow-up](reviews/2026-11-18-mvc-core-review-followup.md) §4 recommended, now required by the product.

For Project 1 in the UX doc: 2 engine workers (A, B), 3 sessions, and no session workers until a session runs something heavy (§5).


## 2. Terms

| Term | Means | In code today |
|---|---|---|
| **Project** | A named group of models and sessions | `WorkspaceProject` in `src/workspace/persistence.ts` (`{id, label, path}`), models only |
| **Model** | A source file (IFC, STEP, GLB, …) the project lists, with its version history | A load route (GitHub path, Drive id, local OPFS name) |
| **Session** | A conversation thread over some of the project's models: conversation, model refs, placements, op logs, view state | Not built |
| **Model engine** | The Conway worker for one model | `EngineSession` and `EngineHost` in `src/engine/` ([engine-worker.md](engine-worker.md) §5) |

**A naming collision.** [engine-worker.md](engine-worker.md) calls one model's engine a "session" (`EngineSession`, "budget per session"). In this doc and in the UI, "session" means the user's session. This doc calls the per-model worker the **model engine**. Rename `EngineSession` to `ModelEngine` in the PR that first adds user-session code, so the two never share a word in one file. That rename touches only code and the engine-worker doc's wording, not the protocol.


## 3. Who owns what

```
Project
 ├─ models: A, B                 (identities; no engine until opened)
 └─ sessions: S1 {A,B}, S2 {A}, S3 {B}
                │
   EngineHost ──┼─ engine(A)  ← held by: tab "A", S1, S2
                └─ engine(B)  ← held by: S1, S3
```

- **One engine per model identity.** The host keys engines by the model's source and version (the same identity `share-200` pins, §4), and hands out holds. A tab showing A directly is a holder; so is each open session that uses A. Two sessions that pinned different versions of A get two engines.
- **Holds, then the cap.** An engine with holders is live. [engine-worker.md](engine-worker.md) §5.2's rules then apply unchanged: at most 3 live engines on desktop, a memory budget, pausing background pumps before evicting anything, and LRU eviction among the rest. An engine whose holders are all in the background can be evicted, and reopens from its index sidecar without a re-parse (§5.3, #2085). The engine of the active view is never evicted.
- **Engines are read-only.** No op reaches the engine. Every engine read (`tree`, `props`, `propertyTables`, …) answers for the file as written. A session's edits are applied over those answers on the page (§6).
- **The scene is per view.** Each tab or session view builds its own scene from its engines' geometry. A composite session (S1) builds one scene from two engines. This is where `open-205`'s Phase 2 (#2024) starts: one `IfcAPI` per model (decided 2026-11-01), and the `modelID = 0` hard-coding removed.


## 4. The session document

A session is files, so it can be kept locally first and in a project repository later ([workspace-store.md](workspace-store.md)). The layout follows the record-versus-stream split workspace-store.md §1.3 already uses for conversations:

```
<project>/
  sessions/<session-id>/
    session.json          # small: title, models, placements, view
    conversation.jsonl    # append-only; AI SDK responseMessages (ai-workspace.md D10)
    ops/<model-key>.jsonl # one op log per model the session uses (model-edit.md L1)
```

`session.json`, as a sketch:

```json
{
  "id": "s_…",
  "title": "Roof plant access review",
  "models": [
    {"key": "A", "model": "<project model id>", "version": "<pinned version>",
     "placement": null, "layer": {"visible": true, "faded": false}},
    {"key": "B", "model": "<project model id>", "version": "<pinned version>",
     "placement": {"matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]}, "layer": {"visible": true, "faded": true}}
  ],
  "view": {"tab": "A", "camera": "…", "display": "…"},
  "updated": "2026-11-18T00:00:00Z"
}
```

- **`key`** is short and local to the session. It names the model in refs (§5) and in the op-log file name, and it never changes when the model is renamed.
- **`version`** pins what the session was made against. Its format is `share-200`'s version identity ([model-versioning.md](model-versioning.md)), not a new one. A model that moved on since is shown as such (UX: "Resume a session"); the session is never silently re-pointed.
- **`placement`** is `null` when the model's own coordinates are used; set it only when the person moves a model. IFC georeferencing is applied first, as today (`stampAppliedCoordination`).
- **`view`** reuses the permalink terms (`#c:`, `#cp:`, `#d:`), so a session's view and a shared link describe a view the same way.
- **Where it is kept.** Locally first, beside the Tier-1 project list (`workspace/persistence.ts`, #1662). The account-level sync (#1662's Auth0 tier) carries the project and session list only. A conversation is too large for it, so it stays on the device until the conversation store (T10) exists. This replaces D10's "per model" key with "per session".
- **The manifest.** The MVC-core review's §7.3 `manifest.json` is this file: which models, which versions, which op logs. Its model and version fields are `share-200`'s; this doc only adds the session-level fields.


## 5. Workers: engines always, sessions when needed

The owner's first sketch gave each session a worker. Decided on 2026-11-18 (§8, 1): not by default, for these reasons.

- **A session's own work is small.** Reading `session.json`, appending to the conversation, and folding a short op log take milliseconds. Parsing, geometry and property reads are already in the model engines.
- **A worker costs.** A model engine measured about 45 MB and 0.4–0.6 s to start ([engine-worker.md](engine-worker.md) §1). A session worker without Conway would be smaller, but three of them buy nothing until a session computes something.
- **Keep the door open.** Write the session as a message-passing module, the way the engine has an in-process fallback (`spawnEngine.js`). Then moving a session into a worker is a transport change, not a rewrite.

Give a session a worker when it runs a job that would block the page:
- comparing or clash-checking two models;
- folding a long op log;
- the future writer that turns a session's edits into a new model file (`create-engine.md` §B2). That writer runs next to Conway, so it is more likely a job on the model engine than in a session worker.

**Decided (§8, 1):** sessions on the page, workers on demand.


## 6. Refs, tools and edits across models

**Refs name a model.** Today's refs (`e123`, `o1.2.3`, `n<seg>/…`, `g<GlobalId>`; [model-edit.md](model-edit.md) §5) assume one model. In a session they need the model key: `A` plus `e123`. Constraints on the separator:
- it can't be one that refs already use or that a name in a path can contain: `.`, `/`, `~`, `_` and more;
- it can't be any of `:`, `=`, `,` or `+`, which the `#d:` permalink grammar uses for its prefix, terms and lists ([model-display-controls.md](model-display-controls.md) §6.3);
- a bare ref stays valid when the session has one model, so existing permalinks and single-model sessions don't change.

Because a path can contain almost any character, the key is placed first and restricted, rather than reserving a character everywhere (§8, 4).

**Resolution moves next to the engine.** Today `src/viewer/tools/refs.js` resolves refs on the page against the store's `rootElement`. For several models, and for a CLI later, resolution becomes a session function: split off the model key, then resolve within that model's tree from its engine. This is gap 1 of the follow-up review's §4.

**Tools take the session.** The Assist tools (#1946) work inside the active session:
- `model.query` and `model.properties` gain an optional `model` key (all models when omitted), and return model-qualified refs.
- `view.*` acts on the session's view, so hiding `A` + `e123` hides it in this session only.
- `create-310`'s write tools append to the session's op log for that model ([ai-workspace.md](ai-workspace.md) §2.1 "Write path").

**Edits.** A session's op log for A is folded over A's engine reads. View apply (`batchedEdit`) changes only that session's scene, so S2's view of A never sees S1's edits. Opening A directly shows A without any session's edits. Turning a session's edits into a new version of A is an explicit step: Conway's splice writer materializes a new file ([create-engine.md](create-engine.md) §B2, not built), which becomes a new `share-200` version. Keeping and replaying the log on reopen is `create-300` L3 (#1918).


## 7. Build order

Each step is useful on its own and has one owner.

1. **Op log, keyed by session and model** (`create-300`, #1916). The pure module the follow-up review asked for, with the model key in every op from the start. Unit tests only.
2. **Session document and local persistence** (`assist-300`, extending #1662). `session.json` plus `conversation.jsonl` on the device; no UI yet.
3. **Sessions in the left nav** (`assist-300`; UX "Browse a project's models and sessions"). Start, rename and reopen a session over one model.
4. **Engines held and shared** (`open-205`, #2031 steps 7–8). Host keyed by model identity; holds from tabs and sessions; the existing cap and eviction.
5. **Model-qualified refs** (this doc §6, with model-display-controls.md §6.3). Refs, `refs.js` resolution and the `model.*` tools.
6. **Several models in one view** (`open-205` Phase 2, #2024, then `open-210`, #1251). Per-model store, `modelID = 0` removed, layers.
7. **The conversation in the session** (`assist-310`, #1672 and the agent loop #1675). The tray opens on the active session; its messages persist with it.

Steps 1, 2 and 4 don't depend on each other. Steps 3, 5 and 6 depend on 2, 1 and 4 respectively.


## 8. Decisions (owner, 2026-11-18)

1. **Session workers: on demand.** A session runs on the page; it gets a worker only for a job that would block it (§5).
2. **A model opened directly has no session.** Its view carries a chat icon; choosing it starts a session about that model, with that model as the session's first (UX: "Open a model on its own").
3. **Sessions can sit outside a project,** in an Ungrouped group, as models do today (#1692).
4. **The ref separator: positional, not yet picked.** Refs use `/` today (`n` paths), and names inside a path can hold other characters, such as `_`. So no character is safe to reserve everywhere. Instead, a model-qualified ref always *starts* with the model key, and the key's own characters are restricted (for example letters and digits only). The first separator after the key is then unambiguous whatever follows it, and a bare ref, with no key, stays valid in a one-model session (§6). The separator itself is picked with model-display-controls.md §6.3.
5. **Live models per session: 3 on desktop for now.** That is engine-worker.md §5.2's cap, an early guess that hasn't been tuned. A session doesn't add a limit of its own: a fourth model's engine waits for, or evicts, a background one by the existing rules. Revisit when the cap is measured.
6. **The flag-off layout is today's production layout, inset in the workspace.** It hasn't been designed beyond that; it is left open for `assist-300`.


## 9. What this changes elsewhere

- **[ai-workspace.md](ai-workspace.md) D15 and [engine-worker.md](engine-worker.md) §1** now agree: the model engine is the document's read layer; sessions hold the op logs and resolve refs; the engine never holds edits. Both point here.
- **ai-workspace.md D10:** conversations are kept per session, not per model (§4).
- **[conversational-cad.md](conversational-cad.md) §2.9** (in draft PR #2138): open questions 1 and 2 are answered by the UX doc's "Decisions so far". The drawer keeps a Models group beside Sessions.
- **[roadmap.md](../roadmap.md) §10 "Sessions"** is answered for what a session is; the unit of "private" (`conversational-cad.md` §5.1) stays open.
- **[model-edit.md](model-edit.md):** an op log belongs to one session and one model. Its L3 replay-or-cache question now has a sidecar reopen to compare against (follow-up review §7).
