# Open 200

**Epic:** [open-200: Workspace — projects, models and sessions · #1657](https://github.com/bldrs-ai/Share/issues/1657) · **Scope snapshot: 2026-11-18**

## Motivation

People rarely work on one model at a time. They have a building and its structure, a product and its parts, a set of models under review, and they come back to the same set over days. The workspace turns Share from a one-model viewer into a workspace: a left nav groups models into projects and lists the sessions started on them, and a top bar says where you are. It is UI and routing only, with no AI dependency, behind `?feature=workspace`; with the flag off, Share shows today's layout.

Since 2026-11-18 the left nav holds sessions as well as models. A session is one conversation thread over one or more of a project's models, and a model belongs to its project rather than to a session, so any model also opens on its own ([workspace.md](workspace.md), [workspace-sessions.md §8](../new/workspace-sessions.md)). A project's models and sessions are both its assets, which is why the workspace is an Open epic, `open-200`, and the base the other `open-2xx` epics build on (renumbered from `assist-300` on 2026-11-18; aliases in the [triage record](open-200-triage.md)).

## Journey

**Create a project → add models from any source → see the project's Models and Sessions → open a model on its own, or open a session → come back later and find it all there.** A chat icon on a model opened on its own starts a session about it. Anything opened outside a project lands under Ungrouped. The top bar names the project, model and element, and holds search, Open, Save, Profile, Share and Apps.

## UX stories

Each linked issue carries the `open-200:` prefix and owns its tasks and acceptance. #1657 has these nine formal stories as its direct sub-issues.

| Story | User goal |
|---|---|
| [Group models into projects in the left drawer · #1661](https://github.com/bldrs-ai/Share/issues/1661) (closed) | Create projects, add models to them, open them from the drawer; collapse, resize and use it on a phone. |
| [Browse a project's models and sessions · #2193](https://github.com/bldrs-ai/Share/issues/2193) | See each project's Models and Sessions, with empty states and an Ungrouped place. Follow-up to #1661. |
| [Open a model on its own · #1664](https://github.com/bldrs-ai/Share/issues/1664) | Look at one of the project's models without starting a session, and start one from its chat icon. |
| [Keep projects, models and sessions across reloads · #1662](https://github.com/bldrs-ai/Share/issues/1662) | Find everything again after a reload, and on another browser when signed in. |
| [See where I am in the top bar, and search from it · #1663](https://github.com/bldrs-ai/Share/issues/1663) (closed) | Read the project, model and element in a breadcrumb, and search from the top bar. |
| [Reach Profile and Share from the top bar · #1665](https://github.com/bldrs-ai/Share/issues/1665) (closed) | Find Profile and Share in one place. |
| [Side drawers open beneath the top bar, and Notes starts with New note · #1992](https://github.com/bldrs-ai/Share/issues/1992) (closed) | Keep the top bar in view while drawers are open, with Open, Save and Apps in it. |
| [Get back to running and pinned apps from the right edge · #1993](https://github.com/bldrs-ai/Share/issues/1993) (closed) | Return to an app from a bar on the right border. |
| [Reach About, Pricing, News and my account from the logo · #1666](https://github.com/bldrs-ai/Share/issues/1666) | Reach the marketing pages and, once `identity-300` lands, the account. |

Starting, resuming and separating sessions belong to `assist-310` ([#1659](https://github.com/bldrs-ai/Share/issues/1659)); viewing a session's models together belongs to `open-210` ([#1251](https://github.com/bldrs-ai/Share/issues/1251)). Design-system icon tokens ([#1667](https://github.com/bldrs-ai/Share/issues/1667)) and the shell's design-system alignment ([#1989](https://github.com/bldrs-ai/Share/issues/1989)) are support work linked from the epic, not stories.

This snapshot makes no completion claim. The [triage record](open-200-triage.md) holds the aliases, inventory and ownership crosswalk. Current progress, tasks and open decisions live in [#1657](https://github.com/bldrs-ai/Share/issues/1657) and its stories. Revise and re-date this page when the epic's motivation or story scope changes; Git history keeps earlier versions.
