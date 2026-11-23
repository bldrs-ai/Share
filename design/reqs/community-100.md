# Community 100

**Epics:** [community-100: Welcome and onboarding · #2293](https://github.com/bldrs-ai/Share/issues/2293), [community-110: Analytics and feedback · #2294](https://github.com/bldrs-ai/Share/issues/2294), [community-200: Report a bug with a screenshot and session state · #2295](https://github.com/bldrs-ai/Share/issues/2295); `community-210` (AEC outreach) is owned by bizdev · **Scope snapshot: 2026-11-23**

## Motivation

A visitor who has never seen Share needs to know what it is and what to do first. People who use it need a low-effort way to tell us what works and what doesn't, and a way to report a problem so it can be reproduced. These epics are that loop: a welcome, a measured product, a feedback tap, and a bug report that carries the session state.

The journey is **first visit → welcome dialog → drop or open a model → use it → leave with a thumbs or a survey, or report a problem**.

## UX stories

| Epic | Story | User goal |
|---|---|---|
| `community-100` | [Show a welcome dialog to a first-time visitor · #1285](https://github.com/bldrs-ai/Share/issues/1285) (closed) | See orientation once, not on every visit. |
| `community-100` | [Guide a first-time user · #1320](https://github.com/bldrs-ai/Share/issues/1320) | The "First time user" checklist, partly done. |
| `community-110` | [Ask for feedback with a thumbs widget and a survey link · #61](https://github.com/bldrs-ai/Share/issues/61) | One tap to say what you thought. **MVP impact:** needed for public launch (Phase E). |
| `community-110` | [Measure usage with Google Analytics · #38](https://github.com/bldrs-ai/Share/issues/38) (closed) | The shipped analytics baseline. |
| `community-200` | [Report a bug with a screenshot and session state · #62](https://github.com/bldrs-ai/Share/issues/62) | File a reproducible GitHub issue from inside Share. Post-MVP. |

## Not owned here

- **`community-210` (AEC outreach)** is owned by the bizdev growth-strategy doc, not by this repository. Its in-repo dependency is Phase G instrumentation, which lands first.
- **Analytics consent** is [#2048](https://github.com/bldrs-ai/Share/issues/2048) under `identity-300`. The growth funnel and its events are `grow-120` in bizdev.

**Milestone:** `community-100` is shipped (1xx); `community-110` is 🟡 for Phase E; `community-200` is post-MVP. The hypotheses are in the [triage record](community-100-triage.md). Revise and re-date this snapshot when a story list changes.
