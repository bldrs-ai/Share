# Assist 310

**Epic:** [assist-310: Conversational agent panel (single-user) · #1659](https://github.com/bldrs-ai/Share/issues/1659) · **Scope snapshot: 2026-11-18**

## Motivation

People who work on a model spend their time hunting through the tree, the properties and the menus to answer simple questions about it. The assistant lets them ask instead: it reads the model on the device, answers in a tray beside it, and acts on the view by selecting, isolating, hiding and framing what it found. The model's bytes never leave the device; only the conversation and tool results do. On a large model that nobody else can open in a browser, this is the demo that sells the AI workspace ([roadmap](../roadmap.md) §7.4 AI.2).

Since 2026-11-18, the conversation is a **session**: one thread over one or more of a project's models, which can be reopened later and never leaks into another session over the same model ([workspace requirements](workspace.md); [technical design](../new/workspace-sessions.md)).

The journey is **open a model or a project → start a session → ask → watch the assistant act, and follow what it names → come back and resume**. The person can use the hosted assistant within their plan's credits or bring their own provider key, and choose the AI model that answers. This epic is single-user; shared channels are `assist-400` (#1660), and tools that edit the model are `create-310` (#1919).

## UX stories

Each linked issue carries the `assist-310:` prefix and owns its tasks and acceptance. #1659 has these 11 formal stories as its direct sub-issues, all open:

| Story | User goal |
|---|---|
| [Start a session on some of a project's models · #1672](https://github.com/bldrs-ai/Share/issues/1672) | Start a session from a project or a model's chat icon, pick its models, and talk in the tray. |
| [Resume a session · #2194](https://github.com/bldrs-ai/Share/issues/2194) | Reopen a session with its conversation, models and view as they were. |
| [Keep sessions apart · #2195](https://github.com/bldrs-ai/Share/issues/2195) | Keep each session's changes to itself, even over the same model. |
| [Get the assistant's replies and actions as they happen · #1675](https://github.com/bldrs-ai/Share/issues/1675) | Ask a question and get a streamed reply while the assistant selects, isolates or frames. |
| [Jump to an element or view the assistant mentions · #1673](https://github.com/bldrs-ai/Share/issues/1673) | Click an element or view named in a reply and go there, with a link that still works outside Share. |
| [Use the hosted assistant within my plan's credits · #1933](https://github.com/bldrs-ai/Share/issues/1933) | Use the assistant without a key, see the credits left, and know what happens at the limit. |
| [Use the assistant with my own provider key · #1930](https://github.com/bldrs-ai/Share/issues/1930) | Bring a provider key or account, test it, and forget it, knowing what the AI can see. |
| [Choose which AI model answers · #1934](https://github.com/bldrs-ai/Share/issues/1934) | Opt into free models with their disclosure, or pick a priced model on Pro. |
| [Get simple commands done instantly, with Undo · #1937](https://github.com/bldrs-ai/Share/issues/1937) | Have a one-step command done at once, with Undo, and the rest handed to the assistant. |
| [See answers as tables, filters or forms in the conversation · #1938](https://github.com/bldrs-ai/Share/issues/1938) | Get an answer as a small table, filter or form instead of prose. |
| [Keep the view uncluttered while the assistant is open · #1676](https://github.com/bldrs-ai/Share/issues/1676) | Have the controls fold away while the tray is open (a proposal that can be dropped). |

Support work is linked from the epic rather than parented under it: the design doc (#1671, closed), the viewer tool surface (#1674, under the Track T11 issue #2225), three spikes (#1927, #1928, #1929) and CSP hardening (#1935). BotChat's unsandboxed code path (#1822) is closed under #1675, which removed it. The Create seam contract (#1936) moved to `create-320` (#1920). Listing sessions in the left nav belongs to `assist-300` (#2193), and viewing a session's models together to `open-210` (#1251).

This snapshot makes no completion claim. The [triage record](assist-310-triage.md) holds the reconciliation and its open decisions; progress, tasks and acceptance live in #1659 and its story issues. Revise this page when the epic's motivation or story scope changes, date the new snapshot, and use Git history to compare earlier versions.
