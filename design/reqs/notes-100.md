# Notes 100

**Epic:** [notes-100: Anchored notes · #670](https://github.com/bldrs-ai/Share/issues/670) · **Scope snapshot: 2026-11-14** (revises 2026-11-12)

## Motivation

Model reviewers need to discuss a specific place in a model without losing the context when a conversation moves between people. Notes brings the discussion into Share: readers can find an anchored note, revisit its model view, follow the conversation and share that context with another reviewer. Authorized contributors can create and maintain notes and replies through the existing GitHub-backed integration.

The basic journey is **open a model → find or create a note → discuss it → share the note → return to the same context**. Reading, contributing and changing content respect the source's permissions. A Share link does not make a publicly hosted GitHub discussion private.

## UX stories

Each linked issue carries the `notes-100:` prefix and owns its detailed tasks and acceptance criteria. #670 has these 20 formal stories as its direct sub-issues.

Eight closed baseline stories keep their history; each has an open follow-up story holding the expanded requirements:

| Baseline (closed) | Follow-up (open) | User goal |
|---|---|---|
| [Browse notes · #1054](https://github.com/bldrs-ai/Share/issues/1054) | [Browse accessible notes with clear model and publication context · #2150](https://github.com/bldrs-ai/Share/issues/2150) | Find the notes available for the model, with clear empty, filtered and unavailable states. |
| [Open a note and its discussion · #1055](https://github.com/bldrs-ai/Share/issues/1055) | [Revisit a note in its original version and anchor · #2151](https://github.com/bldrs-ai/Share/issues/2151) | Open a note, its replies and its saved model context, on the version it was written against. |
| [Open the source GitHub issue · #1056](https://github.com/bldrs-ai/Share/issues/1056) | [Open the source issue with accurate access context · #2152](https://github.com/bldrs-ai/Share/issues/2152) | Continue in the source system, knowing who can see it there. |
| [Create a note · #1059](https://github.com/bldrs-ai/Share/issues/1059) | [Prepare and publish a note on its original model version · #2149](https://github.com/bldrs-ai/Share/issues/2149) | Publish a note in model context to a destination the author is permitted to use. |
| [Reply to a note · #978](https://github.com/bldrs-ai/Share/issues/978) | [Send replies with honest permissions and recoverable retries · #2154](https://github.com/bldrs-ai/Share/issues/2154) | Reply within the discussion, and recover from a failed send. |
| [Delete a note · #1058](https://github.com/bldrs-ai/Share/issues/1058) | [Withdraw a note with clear retention and recovery behavior · #2153](https://github.com/bldrs-ai/Share/issues/2153) | Withdraw a note and know what stays accessible. |
| [Share a note link · #1071](https://github.com/bldrs-ai/Share/issues/1071) | [Share an opaque note link within its intended audience · #2155](https://github.com/bldrs-ai/Share/issues/2155) | Send a link that reaches only the intended audience. |
| [Open a shared note · #1072](https://github.com/bldrs-ai/Share/issues/1072) | [Open shared notes with pinned context and honest access states · #2156](https://github.com/bldrs-ai/Share/issues/2156) | Follow a note link to the same version, anchor and discussion. |

Stories without a baseline/follow-up pair (all open):

| Story | User goal |
|---|---|
| [Save and resume private draft notes · #2148](https://github.com/bldrs-ai/Share/issues/2148) | Keep unfinished notes private on this device and pick them up later. |
| [Edit a note · #1057](https://github.com/bldrs-ai/Share/issues/1057) | Correct a published note, with save, cancel, permission and failure handling. |
| [Edit a comment · #1186](https://github.com/bldrs-ai/Share/issues/1186) | Correct a comment, with the same guarantees. |
| [Delete a comment · #1187](https://github.com/bldrs-ai/Share/issues/1187) | Remove a comment one is permitted to manage. |

Colored topic tags and filtering, [#894](https://github.com/bldrs-ai/Share/issues/894), belongs to `view-230` (maps-style filtering, post-MVP in the roadmap). It is a linked dependency of this epic, not one of its stories; it was briefly a direct child after the 2026-11-12 migration.

**MVP status is not settled by this snapshot.** The roadmap still marks `notes-100` ✔ and §6.0 doesn't list it, while 12 of the stories above are open. Whether that open work is MVP is to be answered with a measured hypothesis ([rubric §"Milestones are hypotheses"](ux-rubric.md#milestones-are-hypotheses)); Notes' instrumentation and holdout start in [bizdev#366](https://github.com/bldrs-ai/bizdev/issues/366). Until there's an estimate, the roadmap owner decides.

This snapshot makes no completion claim. The [triage record](notes-100-triage.md) holds the supporting scope decisions and reconciliation evidence. Current progress, tasks, bugs and acceptance decisions live in [#670](https://github.com/bldrs-ai/Share/issues/670) and its story issues. Revise this page when the epic's motivation or story scope materially changes, date the new snapshot, and use Git history to compare earlier versions.
