# `apps-t300`: App sandbox + MCP bridge

> **Snapshot, 2026-11-19.** Status, progress and open decisions live in the track issue, [#2225](https://github.com/bldrs-ai/Share/issues/2225). This page changes only when the track's work items do ([DX rubric](dx-rubric.md) §"Docs in the repo").

**Primary:** `apps` (`apps-300` Public API + IDE, `apps-310` Bldrs Integrate). **Also serves:** `assist-310` (the in-page agent, #1659), `assist-320` (the AI-apps toolbelt), `create-310` (agent write tools, #1919). **Related tracks:** `assist-t300` (the agent runtime that calls these tools), `create-t300` (the edit substrate that write tools append to). Was T11.

## Why

The viewer's operations should be one contract that every consumer drives: the in-page agent today, sandboxed toolbelt apps next, and the public API after that. Without it each consumer reaches into the viewer its own way. The prototype bot eval'd code, and `WidgetApi` bypasses the selection funnel ([ai-workspace.md](../new/ai-workspace.md) §9). The contract is MCP-shaped, so the same registry can later be served over a postMessage bridge or outside the page without being redesigned (D8).

## End state

- One typed tool registry in `src/assist/` holds the viewer's operations:
  - read tools (`model.*`);
  - view tools with undo (`view.*`);
  - sharing (`share.*`);
  - later, write tools that append to the op log (`create-310`).

  Each tool declares an approval policy.
- Sandboxed iframe apps call that registry over a postMessage bridge. The calls are limited by per-app tool grants, and the app's origin and provenance are checked.
- The same surface is reachable from outside the page, as MCP for external apps and a CLI.

## Work items

These are the sub-issues of #2225.

| Work item | What becomes possible | Evidence that proves it |
|---|---|---|
| [#1674](https://github.com/bldrs-ai/Share/issues/1674) `apps-t300`: viewer tool surface v0 | The agent can drive the remaining v0 view operations: `view.show` (unhide by refs), `view.explode`, `highlight`, `cutPlane`, `display`, `screenshot` (opt-in) and `notes.*`. It can also name a STEP occurrence unambiguously, and the registry ships in its own bundle entry. | Each tool has unit tests, and an E2E through the `?feature=assist` dev hook on desktop and mobile. The STEP ref contract has one table-driven test over the STEP fixture shapes. The build output shows `src/assist/` in its own chunk. |
| [#1386](https://github.com/bldrs-ai/Share/issues/1386) Integration in iframe does not work anymore | An embedding page can load and drive a model in Share's iframe again, which is the precondition for the sandbox bridge. | The iframe integration suite (disabled since #809) is re-enabled and passes in CI. |

Three pieces of planned work have no issue yet. They stay as lines on #2225 until someone picks them up, and become sub-issues then:
- the sandbox security model for toolbelt apps: origin isolation, tool permissions and provenance;
- the postMessage bridge from a sandboxed app to the registry;
- an external transport, so apps outside the page (an MCP server) and a CLI can reach the registry. Which transport is still an open decision on #2225.

**Landed:**
- the tool contract, the registry and its approval policy, and the v0 `model.*` / `view.*` / `share.*` tools (#1946);
- the read-only analysis tools `model.quantities`, `model.measure` and `model.spatial` (#2219).

## Design and code

- [ai-workspace.md](../new/ai-workspace.md):
  - §9 is the client library and tool surface (D7, D8);
  - §11 is the Create seam, a remote tool provider;
  - §16 defers the sandbox and MCP security section until `assist-320` starts.
- [step-occurrence-selection.md](../new/step-occurrence-selection.md): the occurrence refs that #1674's ref contract extends.
- [workspace-sessions.md](../new/workspace-sessions.md): refs that name a model, once several share a session.
- Code at [`0af98b3e`](https://github.com/bldrs-ai/Share/tree/0af98b3e25c825a11365c3c5661074a9126b3fd8):
  - [`src/assist/`](https://github.com/bldrs-ai/Share/tree/0af98b3e25c825a11365c3c5661074a9126b3fd8/src/assist): contract, registry and policy;
  - [`src/viewer/tools/`](https://github.com/bldrs-ai/Share/tree/0af98b3e25c825a11365c3c5661074a9126b3fd8/src/viewer/tools): the viewer's tools and host;
  - [`src/WidgetApi/`](https://github.com/bldrs-ai/Share/tree/0af98b3e25c825a11365c3c5661074a9126b3fd8/src/WidgetApi): the old iframe API, which seeds the bridge.
