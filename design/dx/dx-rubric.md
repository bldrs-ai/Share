# DX tracks how-to

> **In flight (2026-11-18).** A first pass, by analogy with the [UX rubric](../reqs/ux-rubric.md). Tune it as tracks are reconciled.

A **track** is technical work that several epics depend on: the engine, the render loop, identity, an artifact format, the tool surface. The UX rubric organises what a person can do; this one organises what has to be built so they can. As in UX, the repository keeps short, dated snapshots and the durable design, and GitHub issues hold everything that changes: status, tasks, progress and open decisions.

The [roadmap](../roadmap.md) owns which tracks exist, what each unblocks and its phase (§3.2, §5). This document owns how a track is written down and tracked.

## Track, work item and task

- **Track:** a technical capability several epics need, and the end state that proves it. Its issue is `T<n>: <name>`, labelled `Tracking`, and it is the track's root in GitHub.
- **Work item:** one technical outcome that can be checked on its own, written as what becomes possible and for what: "the engine reopens a model from its index sidecar, so a reload skips the parse". It is a native sub-issue of its track issue.
- **Task:** a concrete step inside a work item, kept as a checkbox in its body, not a separate issue.
- **Evidence:** what proves a work item is done. A test that can fail ([STYLE.md](../../STYLE.md) §"Assertions must be able to fail"), a measurement with its date, commit and machine, a CI job, or a default flipped with its kill switch named. A UX story is proven by the user's own action on desktop and mobile; a work item is proven by one of these.

## Where technical work lives

- **Serves one story:** a sub-issue of that story, under its epic's prefix ([UX rubric](../reqs/ux-rubric.md) §"Issue normalization"). Most implementation work is here.
- **Serves several epics, or is infrastructure no story owns:** a sub-issue of its track issue, titled `T<n>: …`. Epics keep only formal UX stories as direct children, so this is where cross-epic work goes instead of under one epic.
- **Neither:** a one-off bug or chore stays standalone, labelled, and linked from wherever it's found.

Before parenting an issue under a track, check that the roadmap doesn't give the work to an epic, and that no other track's issue already holds it. An issue has one parent; link the other side.

The bizdev boundary is the UX rubric's (§"Where each kind of work lives"): measurement plans and business numbers stay in bizdev, and the code half of a bizdev plan is a Share work item.

## Numbering

Tracks are numbered in order, `T1`, `T2`, …, with no tier digit. That's the stable ID the UX rubric is working toward (§"Milestones are hypotheses"): a track's phase and the milestone it serves are recorded in the roadmap and change with the evidence, without renaming the track.

- A new track takes the next number and a row in roadmap §3.2 and §5.
- A track that's finished stays listed with ✔; it is never renumbered or reused.
- A work item keeps its issue number. Its title carries the track prefix only while it is a direct child of the track issue; one nested under a story keeps the epic's prefix.

## The track issue

About 400 words, in this order:

1. **What and why:** the capability, and the epics it unblocks.
2. **Status:** landed, in flight, not started, with the PRs that landed it.
3. **Work items:** native sub-issues. Work that has no issue yet may be a checkbox line until someone picks it up; it becomes a sub-issue then.
4. **Open decisions,** each with its owner.
5. **Related:** neighbouring tracks and epics, the snapshot and the design docs.

The roadmap's track Status line ends with the issue's link. When rewriting an existing issue, keep its original text collapsed at the bottom, as the UX rubric does (§"Write for a reader who wasn't there").

The first track issues were written with checkbox lists (T2 #2201, T3 #2202, T4 #2203, T6 #2204); T11 (#2225) is the first with its work items as sub-issues. Convert the others as their tracks are next worked on.

## Docs in the repo

| Kind | Where | What it holds | What it doesn't |
|---|---|---|---|
| Track snapshot | `design/dx/t<n>.md` | One page, dated: why the track exists, the end state, its work items with issue links, the design docs that govern it. | Status, checklists, progress. |
| Design doc | `design/dx/<topic>.md` (today mostly `design/new/`) | How it works and why: decisions, contracts, measurements with their date and commit, rejected alternatives. Durable. | A backlog, or "next steps" lists that are really issues. |
| Triage record | `design/dx/t<n>-triage.md`, only when reconciling a track moved real issues | The inventory, crosswalk and changes applied, as in the UX rubric (§"Record the result"). | A copy of the issues. |

A snapshot is updated in the same PR that changes the track's work items (adds, moves or retires one), and is re-dated. The design doc is updated by the PR that changes the behaviour it describes. Pin every link to code or a retired doc to a commit.

The UX rubric's lean-records and plain-language rules apply unchanged (§"Keep the records lean", §"Write for a reader who wasn't there"): map rather than copy, no live checklists in the repo, no process narrative, budgets for issue bodies.

## Moving `design/new/` into UX and DX

`design/new/` mixes three things: user-facing requirements, technical design, and status. Split each doc as it's next worked on, not in one big move:

- **User requirements** go to the epic's UX docs (`design/reqs/`), or into its stories.
- **Technical design** goes to `design/dx/`, under the track or topic that owns it.
- **Status, plans and next steps** go into the track or story issues, and the doc points at them.

Move a file with `git mv`, and update the router ([AGENTS.md](../../AGENTS.md)) and every inbound link in the same PR. A doc that issues or other repositories link to keeps a one-line stub at its old path, pointing to the new one.

## Reconciling a track

1. **Inventory:** the roadmap's §5 entry, its design docs, and its issues, open and closed, by search and by milestone, as in the UX rubric (§"Issue normalization").
2. **Classify each issue:** it belongs to this track, to one story, or to another track, or it's a standalone bug.
3. **Write the track issue** (above), and parent the work items under it.
4. **Write the snapshot** and, if issues moved, the triage record.
5. **Point the roadmap's track Status line** at the issue, and the router at the snapshot.

### Before marking the PR ready

- The snapshot lists exactly the track issue's sub-issues.
- No issue was parented under the track while the roadmap gives its outcome to an epic or another track.
- Each work item says what evidence will prove it.
- Neither the snapshot nor the triage record contains `- [ ]`, and every code or retired-doc link is pinned.
- The roadmap, the router and the track's design docs have been searched for wording that describes the state before this change.
- Docs-only work skips review under [agent-workflow.md](../new/agent-workflow.md) §"Review"; mark it ready rather than leaving it in draft.
