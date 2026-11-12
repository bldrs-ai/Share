# Notes 100

**Epic:** [notes-100: Anchored notes · #670](https://github.com/bldrs-ai/Share/issues/670) · **Scope snapshot: 2026-11-12**

## Motivation

Model reviewers need to discuss a specific place in a model without losing the context when a conversation moves between people. Notes brings the discussion into Share: readers can find an anchored note, revisit its model view, follow the conversation and share that context with another reviewer. Authorized contributors can create and maintain notes and replies through the existing GitHub-backed integration.

The basic journey is **open a model → find or create a note → discuss it → share the note → return to the same context**. Reading, contributing and changing content respect the source's permissions. A Share link does not make a publicly hosted GitHub discussion private.

## UX stories

Each linked issue carries the `notes-100:` prefix and owns its detailed tasks and acceptance criteria.

| Story | User goal |
|---|---|
| [Browse notes · #1054](https://github.com/bldrs-ai/Share/issues/1054) | As a reader, I want to find the notes available for the model so I can discover relevant discussion. |
| [Open a note and its discussion · #1055](https://github.com/bldrs-ai/Share/issues/1055) | As a reader, I want to open a note, its replies and saved model context so I can understand the discussion. |
| [Open the source GitHub issue · #1056](https://github.com/bldrs-ai/Share/issues/1056) | As a reader, I want to open the underlying issue so I can continue in the source system. |
| [Create a note · #1059](https://github.com/bldrs-ai/Share/issues/1059) | As an authorized contributor, I want to publish a note in model context so others can understand and respond to my observation. |
| [Reply to a note · #978](https://github.com/bldrs-ai/Share/issues/978) | As an authorized contributor, I want to reply within a note's discussion so the conversation stays together. |
| [Edit a note · #1057](https://github.com/bldrs-ai/Share/issues/1057) | As an authorized contributor, I want to correct a note so its content stays useful. |
| [Delete a note · #1058](https://github.com/bldrs-ai/Share/issues/1058) | As an authorized contributor, I want to withdraw a note with a clear explanation of what remains accessible. |
| [Share a note link · #1071](https://github.com/bldrs-ai/Share/issues/1071) | As a reader, I want to send a note link so another person can visit the same discussion and model context. |
| [Open a shared note · #1072](https://github.com/bldrs-ai/Share/issues/1072) | As a recipient, I want to follow a note link so I can understand the referenced model and conversation. |
| [Edit a comment · #1186](https://github.com/bldrs-ai/Share/issues/1186) | As an authorized contributor, I want to correct a comment so my contribution remains accurate. |
| [Delete a comment · #1187](https://github.com/bldrs-ai/Share/issues/1187) | As an authorized contributor, I want to remove a comment I am permitted to manage. |

This snapshot captures the eleven reconciled UX stories, not a completion claim. The [live Notes requirements](https://github.com/bldrs-ai/Share/issues/670) track subsequent evolution, including private drafts, exact-version context and topic filtering; the [triage record](notes-100-triage.md) holds the supporting scope decisions and reconciliation evidence.

Current progress, tasks, bugs and acceptance decisions live in the epic and story issues. Revise this page only when the epic's motivation or story scope materially changes, date the new snapshot, and use Git history to compare earlier versions.
