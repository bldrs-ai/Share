# Share 130

**Epic:** [share-130: Private-by-default links and a visibility chip · #2206](https://github.com/bldrs-ai/Share/issues/2206) · **Scope snapshot: 2026-11-18**

## Motivation

Authors need a shared model to stay private unless they decide otherwise, and recipients need to know who else can open it. Today a Share link to a GitHub model is its source path: it reveals the repository, and it can't be private by itself.

The journey: before sharing, **see and confirm who will be able to open it** → copy an unguessable link to the exact version and view → a recipient opens it, sees its audience, and gets a clear explanation if it won't open.

## UX stories

Migrated from the Sharing UX draft, 2026-11-18:

| Story | User goal |
|---|---|
| [See and confirm who can open the share · #2212](https://github.com/bldrs-ai/Share/issues/2212) | Know exactly what a link holder can open before I share. |
| [Share an unlisted link to a version and view · #2215](https://github.com/bldrs-ai/Share/issues/2215) | Send a link that opens the same version and view, and can't be guessed. |
| [Understand why a shared version won't open · #2217](https://github.com/bldrs-ai/Share/issues/2217) | Know whether to retry, use a local copy or ask the sender. |

Decided 2026-11-18: the unguessable link itself comes from `share-200`'s link resolver (#2144; the rules are in [`model-versioning.md` §5a](../new/model-versioning.md#5a-share-link-contract-binding-ux-requirement)), not from Drive's or GitHub's own link-sharing. Naming specific people is `share-201` (#2207). The visibility chip must show the same classification the quota meter uses, since a Drive file shared by link counts as public. The chip's technical work is Track T4 (#2203).

Decided the same day: `share-200`'s link-resolver slice moves into Phase C with `share-130`, while the rest of `share-200` stays post-MVP.

This snapshot makes no completion claim. The [triage record](share-200-triage.md#sharing-ux-draft-migration--2026-11-18) has the provenance. Current tasks and decisions live in [#2206](https://github.com/bldrs-ai/Share/issues/2206) and its stories.
