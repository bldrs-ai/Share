# MVC core — follow-up, three weeks on

**Status:** review. Nothing here is committed scope.
**Date:** 2026-11-18
**Author:** a Claude Code session, from a read of `main` @ `70a777a`.
**Follows:** [2026-10-29-mvc-core-review_grok-4.7.md](2026-10-29-mvc-core-review_grok-4.7.md) ("the review" below).
**Question:** Where did the review's plan end up, and what has to be decided before the next core work starts?


## 1. Conclusion

The direction held. Of the review's build order (§7.5), none of the document-side pieces exists: no op log, no ref-addressed query surface, no `save`, no manifest, no writer.

Meanwhile `open-205` shipped a per-model engine worker for IFC and STEP and made it the default load path (#2083, 2026-11-07). Its protocol is Conway with no Three and no Zustand, which is the read half the review asked for. [engine-worker.md](../engine-worker.md) §1 already says so: "The worker is the document session."

That claim is right in direction but not yet true. There are three gaps, and two docs now disagree about where the session lives (§4). Settle that first, then build the op log (#1916) as the first code slice. The agent's write tools (`create-310`) still wait on it.


## 2. What was decided (2026-11-01)

- **The core doesn't block the Assist arc.** #1946 (the view tools) was fine to land: the review keeps the web UI as a view, and `view.*` tools are view state in its model (§7.2).
- **The write path is the gate.** `create-310` model-edit tools append ops to the session's op log ([model-edit.md](../model-edit.md) L1) and never call `batchedEdit`, which is only the canvas's apply path. The prerequisite for any model-mutating tool is L1, and ideally the read-only session. Recorded in [ai-workspace.md](../ai-workspace.md) §2.1 "Write path".
- **`model.*` vs `view.*`.** `query` and `properties` are `model.*` tools, served from the view today and re-pointed at the session later, under the same names and result shapes. The prefix names the provider that answers, not the access mode.
- **The document session gets a row in D15** ([ai-workspace.md](../ai-workspace.md) §2.1): a Share `src/` module, no Three, no Zustand, extracted once both `CadView` and a CLI call it.


## 3. What landed since the review

| Area | PRs | Against the review |
|---|---|---|
| Tool contract | #1946 (Assist registry; `model`, `view`, `share` providers) | `model.query` / `model.properties` exist under the names the session will serve (§7.1) |
| Docs | #1997 (D15 row, write path, namespaces), #2000 (note on the review's §2/§8) | The review's §8 Conway-version item is closed: the repo installs its pin, and the shapes it relies on hold |
| One engine | #2002 (real web-ifc build and job removed), bldrs-ai/ifctool#47 (ifclib 6.0.0, engine-free main entry), #2059 (Share on 6.0.0, the `web-ifc` alias deleted) | §3.4's build coupling shrinks: Share resolves nothing named `web-ifc`, and Conway is the only engine |
| Engine worker | #2057 (protocol, client), #2058 (IFC), #2067 (STEP), #2081 (GLB capture), #2083 (default on), #2085 (windowed STEP, index sidecars), #2141 (source policy), #2172 (native source hash) | Most of §7.1's read side, as the view's engine: below |

The engine worker in terms of the review:

- **It is headless.** `src/engine/` runs Conway in a worker with a message protocol (`open`, `tree`, `props`, `propertyTables`, `itemsOfType`, `capture`, `release`, `stats`; engine-worker.md §4). It imports neither Three nor the store; `EngineSession` is its client.
- **One seam serves both formats.** IFC and STEP go through one format-neutral load (engine-worker.md §11). That is §6's "entity model with mesh as a derived capability" in practice, routed by data, not code.
- **It reopens without a re-parse.** A worker load saves conway's index sidecar, and the next open of the same OPFS entry comes up from it (#2085). This bears on the review's §8 L3 question (below).
- **The protocol leaves room for writes.** engine-worker.md §4: "Not in v2: document writes (the op log, model-edit.md L1). They slot in as more ops without changing the shape."


## 4. Two docs, one session: what to reconcile

**[ai-workspace.md](../ai-workspace.md) D15** describes the document session as a new Share `src/` module, distinct from View, that View subscribes to. **[engine-worker.md](../engine-worker.md) §1** says the engine worker already is that session. Both are partly right, and the gap between them is three specific things the worker doesn't do yet.

1. **It isn't addressed by ref.** The protocol takes express IDs. The `e` / `o` / `n` / `g` vocabulary (§5.1) is resolved on the page, by `src/viewer/tools/refs.js`, against the store's `rootElement` and the `SearchIndex`. A CLI holding only a session can't resolve `o1.2.3` or `g<GlobalId>`.
2. **It can't answer `list` or `query`.** `model.query` filters the store's `rootElement` and `SearchIndex` on the page (`viewTools.js#query`). The worker has `tree` and `itemsOfType`, but no query by type, storey, name or text, so the review's §7.1 `list` / `select` don't exist headless.
3. **It has never run outside a browser.** "The same handler runs in Node for a CLI or MCP" (engine-worker.md §1) is unverified. `engineHandler.js` has no Node entry; only Jest exercises it, through the in-process transport.

**Recommendation.** Name the engine session the document session's **read layer**, in both docs. The document session is then:
- the engine session, for parse and reads;
- ref resolution and query, moved next to it from `refs.js` and `viewTools.js#query`;
- the op log;
- `save`.

Keep the op log out of the worker. It's pure data: the page and a CLI both need it, and replaying it into the canvas (`batchedEdit`) happens on the page. It enters the worker only when the splice writer does, as a future `materialize` op that runs next to Conway. That matches engine-worker.md §4's "more ops without changing the shape", and keeps D15's dependency rule (the session never imports Three, View or Assist).

**A second overlap: the manifest.** The review's §7.3 sketches `model.ops.jsonl` plus `manifest.json` (parent revision → part revisions) in a git-shaped workspace. Since then, [model-versioning.md](../model-versioning.md) (`share-200`, #2144, 2026-11-11) plans version manifests, git history, and blob storage outside git for large sources. Its V1 reuses the `create-300` op log. These should be one manifest schema, or two explicitly layered ones (a version pointer that a parts manifest extends), not two designs. `share-200` is further along and has the storage and transport spikes, so it should own the schema; the review's §7.3 should defer to it.


## 5. The review's order (§7.5), step by step

| Step | Status | What's left |
|---|---|---|
| 1. L1 op log, pure, with refs | **Not started.** #1916 open; [model-edit.md](../model-edit.md) still reads "L0 landing, L1–L3 planned" | All of it |
| 2. Headless session over Conway, read-only MCP | **Partly**, as the engine worker (§3) | The three gaps in §4 |
| 3. `save` → `*.ops.jsonl` + `manifest.json` | **Not started**; the manifest is now `share-200`'s to define (§4) | Depends on 1 and on the manifest decision |
| 4. Web view subscribes; `load()` stops owning the document | **Not started** | Depends on 1 |
| 5. Conway splice writer, slices 1–3 | **Not started** ([create-engine.md](../create-engine.md) §B2) | Unchanged |
| 6. Extract the session to a package | Not yet due | The rule stands: after both `CadView` and a CLI call it |


## 6. Next steps, in order

1. **Write down the decision.** Amend D15 and engine-worker.md §1 to say one thing: the engine session is the document session's read layer, and the op log and ref resolution sit beside it, outside the worker (§4). Docs only.
2. **Build the L1 op log (#1916)** as a pure module: `{id, kind, ref, payload, layer}`, an undo cursor, and a fold in the style of `overrideStack.js`. No Three, no store, unit tests only. Nothing calls it yet. This is the `create-310` prerequisite.
3. **A Node spike:** run `engineHandler` through the in-process transport in Node, open `index.ifc` and `index.step`, and answer `tree` and `props`. This proves or retracts engine-worker.md §1's CLI claim before anything is built on it.
4. **Move ref resolution and `query` next to the session**, then re-point `model.query` / `model.properties` at it. Names and result shapes stay as #1946 shipped them.
5. **Reconcile the manifest with `share-200`** (§4) before step 3 of §7.5.
6. **Then `create-310`**, on 2, ideally after 4.


## 7. The review's open questions (§8), now

- **The session's first home.** Answered in practice: `src/engine/` in Share. Keep it there until a CLI calls it.
- **L3: replay the log each load, or cache under `(sourceKey, opLogDigest)`.** Still open, but the cost moved. A reopen from the index sidecar skips the parse (Parsing 0.39 s against 1.78 s on a 58 MB STEP; engine-worker.md §11). So replaying a short log over a sidecar reopen is cheaper than the review assumed, which strengthens model-edit.md §9's recommendation to replay.
- **Cross-file paste.** Open. It waits on the manifest decision.
- **The browser's git transport.** Now `share-200`'s spike A ([model-versioning.md](../model-versioning.md)).
- **The installed Conway against the pin.** Closed (#2000).


## Sources

- [2026-10-29-mvc-core-review_grok-4.7.md](2026-10-29-mvc-core-review_grok-4.7.md) §5.1, §7, §7.5, §8
- [engine-worker.md](../engine-worker.md) §1, §4, §5.1, §7 "Resume here", §11
- [ai-workspace.md](../ai-workspace.md) §2.1 (D15, "Write path"), §9 (namespaces)
- [model-edit.md](../model-edit.md) status, §4, §5, §9; [create-engine.md](../create-engine.md) §B2
- [model-versioning.md](../model-versioning.md) §1, the V1 row, spike A
- [roadmap.md](../../roadmap.md): `create-300` 🟡 (L0 closed; #1916–#1918 remain), `create-310` ⬜
- Code at `70a777a`: `src/engine/engineHandler.js`, `src/engine/EngineSession.js`, `src/viewer/tools/refs.js`, `src/viewer/tools/viewTools.js#query`
