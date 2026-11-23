# Apps 100

**Epics:** [apps-100 · #2288](https://github.com/bldrs-ai/Share/issues/2288), [apps-110 · #2289](https://github.com/bldrs-ai/Share/issues/2289), [apps-300 · #2290](https://github.com/bldrs-ai/Share/issues/2290), [apps-310 · #2291](https://github.com/bldrs-ai/Share/issues/2291), [assist-320 · #2292](https://github.com/bldrs-ai/Share/issues/2292) · **Scope snapshot: 2026-11-23**

## Motivation

Apps are how Share grows beyond what the team builds: small tools that read the open model and add something. Today there is a drawer that lists apps and a demo app. The AI pivot re-scopes everything after that: the viewer's operations become one tool surface that the in-app agent and sandboxed apps share, and apps the agent generates are saved and run in a sandbox. That is why the public API (`apps-300`), model checks in CI (`apps-310`) and the toolbelt (`assist-320`) are all post-MVP, in the AI arc.

The journey today is **open Apps → browse → select an app → its panel opens**.

## UX stories

| Epic | Story | User goal |
|---|---|---|
| `apps-100` | [Browse apps and select an app · #1282](https://github.com/bldrs-ai/Share/issues/1282) (closed) | Open the drawer, pick an app. Under it: [#1171](https://github.com/bldrs-ai/Share/issues/1171) (re-enable the AppStore). |
| `apps-110` | [XYZ app on the v0.1 API · #59](https://github.com/bldrs-ai/Share/issues/59) (closed) | The demo app that dogfooded the first API. |
| `apps-300` | none yet | A public API and IDE, MCP-first. |
| `apps-310` | [Bldrs Integrate, model checks in CI · #60](https://github.com/bldrs-ai/Share/issues/60) | Run checks in a pipeline; absorbed by toolbelt apps. |
| `assist-320` | none yet | Agent-generated apps, saved and run in a sandbox. |

## Not owned here

Track `apps-t300` ([#2225](https://github.com/bldrs-ai/Share/issues/2225)) owns the tool surface, the sandbox and the postMessage bridge. **[#1386](https://github.com/bldrs-ai/Share/issues/1386) (the iframe integration, broken since 2025) must be fixed first**; it is the pivot's blocker (roadmap §7.4 AI.0). `assist-310` ([#1659](https://github.com/bldrs-ai/Share/issues/1659)) is the agent.

**Milestone:** `apps-100` and `apps-110` are shipped (1xx); the rest are post-MVP, in the AI arc. The hypotheses are in the [triage record](apps-100-triage.md). Revise and re-date this snapshot when a story list changes.
