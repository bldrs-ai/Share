# Tracks how-to

> **In flight (2026-11-18; directory renamed 2026-11-24).** A first pass, by analogy with the [UX rubric](../reqs/ux-rubric.md). Tune it as tracks are reconciled. This is the rubric for the DX side of the design tree: `design/reqs/` holds what a person can do, and `design/tracks/` (called `design/dx/` until 2026-11-24) holds what has to be built so they can.

A **track** is technical work that several epics depend on: the engine, the render loop, identity, an artifact format, the tool surface. The UX rubric organises what a person can do; this one organises what has to be built so they can. As in UX, the repository keeps short, dated snapshots and the durable design, and GitHub issues hold everything that changes: status, tasks, progress and open decisions.

The [roadmap](../roadmap.md) owns which tracks exist, what each unblocks and its phase (§3.2). Each track's status lives in its tracking issue. This document owns how a track is written down and tracked.

## Track, work item and task

- **Track:** a technical capability several epics need, and the end state that proves it. Its ID is `<feature>-t<band><nn>`, such as `share-t100` (§"Naming"), and its issue is `<id>: <name>`, labelled `Tracking`, the track's root in GitHub.
- **Work item:** one technical outcome that can be checked on its own, written as what becomes possible and for what: "the engine reopens a model from its index sidecar, so a reload skips the parse". It is a native sub-issue of its track issue.
- **Task:** a concrete step inside a work item, kept as a checkbox in its body, not a separate issue.
- **Evidence:** what proves a work item is done. A test that can fail ([STYLE.md](../../STYLE.md) §"Assertions must be able to fail"), a measurement with its date, commit and machine, a CI job, or a default flipped with its kill switch named. A UX story is proven by the user's own action on desktop and mobile; a work item is proven by one of these.

## Where technical work lives

- **Serves one story:** a sub-issue of that story, under its epic's prefix ([UX rubric](../reqs/ux-rubric.md) §"Issue normalization"). Most implementation work is here.
- **Serves several epics, or is infrastructure no story owns:** a sub-issue of its track issue, titled `<track-id>: …`. Epics keep only formal UX stories as direct children, so this is where cross-epic work goes instead of under one epic.
- **Neither:** a one-off bug or chore stays standalone, labelled, and linked from wherever it's found.

Before parenting an issue under a track, check that the roadmap doesn't give the work to an epic, and that no other track's issue already holds it. An issue has one parent; link the other side.

The bizdev boundary is the UX rubric's (§"Where each kind of work lives"): measurement plans and business numbers stay in bizdev, and the code half of a bizdev plan is a Share work item.

## Naming

> **Provisional (owner, 2026-11-18).**

A track is named after the feature group and milestone band it mainly serves: `<feature>-t<band><nn>`.

- **One track per feature level, usually.** `share-t100` handles the technical work behind the `share-1xx` epics, and `share-t200` the work behind `share-2xx`. A level that needs more takes `t101`, `t102` and so on, but a level should seldom need more than one or two extra.
- **The band follows the epics.** It is the band of the epics the track mainly serves, read from the UX rubric's tier table. A track whose epics move band is renamed, and the rename is recorded in the roadmap's ID lineage, as an epic's is.
- **One primary feature group.** A track may serve several groups and bands. Its ID names the primary one, and its issue and snapshot list the others under Related, with the related tracks.
- **A new track** gets a tracking issue and a row in roadmap §3.2 (its Issue and Docs columns).
- **Kept, never reused.** A finished track stays listed with ✔, and its ID isn't given to another track.
- **Work items** keep their issue numbers. A work item's title carries the track ID while it is a direct child of the track issue; one nested under a story keeps the epic's prefix. Bugs keep their own titles wherever they sit; only the parent link places them (owner, 2026-11-18).
- **The old `T1`…`T12` numbers** are aliases in the roadmap's ID lineage (renamed 2026-11-18). T9, growth, lives in bizdev and keeps its number.

## The track issue

About 400 words, in this order:

1. **What and why:** the capability, the primary feature group and band, and the epics it unblocks.
2. **Status:** landed, in flight, not started, with the PRs that landed it.
3. **Work items:** native sub-issues. Work that has no issue yet may be a checkbox line until someone picks it up; it becomes a sub-issue then.
4. **Open decisions,** each with its owner.
5. **Related:** other feature groups and bands it serves, related tracks, the snapshot and the design docs.

The roadmap's §3.2 row links the issue in its Issue column. When rewriting an existing issue, keep its original text collapsed at the bottom, as the UX rubric does (§"Write for a reader who wasn't there").

The first track issues were written with checkbox lists (`share-t101` #2201, `identity-t100` #2202, `share-t100` #2203, `notes-t200` #2204); `apps-t300` (#2225) is the first with its work items as sub-issues, and `open-t200` (#2315) the first whose work items were filed as sub-issues from the start, one per slice of its design. Convert the others as their tracks are next worked on.

## Docs in the repo

| Kind | Where | What it holds | What it doesn't |
|---|---|---|---|
| Track snapshot | `design/tracks/<track-id>.md`, or `design/tracks/<track-id>/README.md` (below) | One page, dated: why the track exists, the end state, its work items with issue links, the design docs that govern it. | Status, checklists, progress. |
| Design doc | `design/tracks/<track-id>/<topic>.md` (today mostly `design/new/`) | How it works and why: decisions, contracts, measurements with their date and commit, rejected alternatives. Durable. | A backlog, or "next steps" lists that are really issues. |
| Triage record | `design/tracks/<track-id>-triage.md` (in a track's directory, `triage.md`), only when reconciling a track moved real issues | The inventory, crosswalk and changes applied, as in the UX rubric (§"Record the result"). | A copy of the issues. |

**One file or a directory.** A track whose only doc here is its snapshot stays a single file, `design/tracks/<track-id>.md` (`apps-t300.md`). A track with design docs of its own gets a directory, `design/tracks/<track-id>/`: `README.md` is the snapshot, and the design docs sit beside it (`open-t200/README.md` and `open-t200/layering.md`, the first). A track moves from the file to the directory with `git mv` when its first design doc arrives.

A snapshot is updated in the same PR that changes the track's work items (adds, moves or retires one), and is re-dated. The design doc is updated by the PR that changes the behaviour it describes. Pin every link to code or a retired doc to a commit.

The UX rubric's lean-records and plain-language rules apply unchanged (§"Keep the records lean", §"Write for a reader who wasn't there"): map rather than copy, no live checklists in the repo, no process narrative, budgets for issue bodies.

## Moving `design/new/` into UX and DX

`design/new/` mixes three things: user-facing requirements, technical design, and status. Split each doc as it's next worked on, not in one big move:

- **User requirements** go to the epic's UX docs (`design/reqs/`), or into its stories.
- **Technical design** goes to `design/tracks/`, into the directory of the track that owns it.
- **Status, plans and next steps** go into the track or story issues, and the doc points at them.

Move a file with `git mv`, and update the router ([AGENTS.md](../../AGENTS.md)) and every inbound link in the same PR. A doc that issues or other repositories link to keeps a one-line stub at its old path, pointing to the new one; where the inbound links are few, fix them in the issues instead and say so in the PR, as the 2026-11-24 rename of `design/dx/` did (one link, in #2225).

## Reconciling a track

1. **Inventory:** the roadmap's §3.2 row and the track's tracking issue, its design docs, and its issues, open and closed, by search and by milestone, as in the UX rubric (§"Issue normalization").
2. **Classify each issue:** it belongs to this track, to one story, or to another track, or it's a standalone bug.
3. **Write the track issue** (above), and parent the work items under it.
4. **Write the snapshot** and, if issues moved, the triage record.
5. **Put the issue in the roadmap's §3.2 row** (its Issue column), the snapshot in its Docs column, and point the router at the snapshot.

### Before marking the PR ready

- The snapshot lists exactly the track issue's sub-issues.
- No issue was parented under the track while the roadmap gives its outcome to an epic or another track.
- Each work item says what evidence will prove it.
- Neither the snapshot nor the triage record contains `- [ ]`, and every code or retired-doc link is pinned.
- The roadmap, the router and the track's design docs have been searched for wording that describes the state before this change.
- Docs-only work skips review under [agent-workflow.md](../new/agent-workflow.md) §"Review"; mark it ready rather than leaving it in draft.
