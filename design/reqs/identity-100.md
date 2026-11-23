# Identity 100

**Epics:** [identity-100: Sign in with Auth0 · #2285](https://github.com/bldrs-ai/Share/issues/2285), [identity-110: GitHub as a source, beside Drive · #2286](https://github.com/bldrs-ai/Share/issues/2286), [identity-300: Profile drawer and account picker · #2287](https://github.com/bldrs-ai/Share/issues/2287) · **Scope snapshot: 2026-11-23**

## Motivation

Viewing needs no account, but private models, quotas and Pro do. People sign in once, with the provider they already use, and Share then ties their quota and subscription to that account. Where their models live is a separate matter: GitHub and Drive are *connections* the account uses, which is why GitHub is being made a per-account connection like Drive rather than riding on the sign-in.

The journey is **sign in → see who you are and which accounts Share uses → open and save with the account you choose**. Being signed in doesn't grant write access to a destination (the [shared boundaries](README.md#shared-boundaries)).

## UX stories

| Epic | Story | User goal |
|---|---|---|
| `identity-100` | [Sign in and out · #1052](https://github.com/bldrs-ai/Share/issues/1052) | Sign in from the Profile control and see you are signed in. The flow shipped; the story checks it. |
| `identity-110` | none yet | GitHub as a per-account connection. Pending until PR3 is scheduled. |
| `identity-300` | [Analytics consent · #2048](https://github.com/bldrs-ai/Share/issues/2048) (children [#2049](https://github.com/bldrs-ai/Share/issues/2049), [#2050](https://github.com/bldrs-ai/Share/issues/2050)) | A privacy choice in the About dialog, grouped with Profile. |

`identity-120` ([#1422](https://github.com/bldrs-ai/Share/issues/1422), with [#2230](https://github.com/bldrs-ai/Share/issues/2230)) tells returning identities apart and switches Bldrs accounts; the roadmap keeps it as its own epic.

## Not owned here

Track `identity-t100` ([#2202](https://github.com/bldrs-ai/Share/issues/2202)) owns connections as per-account objects, including the PR3 switchover. `open-300` owns opening from several accounts. `subscribe-120` keys the quota ledger to the Auth0 account.

**Milestone:** `identity-100` is shipped (1xx); `identity-110` is post-MVP (PR3); `identity-300` is **required for MVP** (Phase B). The hypotheses are in the [triage record](identity-100-triage.md). Revise and re-date this snapshot when a story list changes.
