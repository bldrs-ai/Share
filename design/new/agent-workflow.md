# Agent workflow: issue-queue burndowns with sub-agents

How we run sizeable issue queues (triage passes, bug burndowns) with
AI agents, and the rubric every agent is held to. Established during
the Aug 2026 conway severe-bug burndown (conway#485/#504/#505/#503,
and the review of conway#508 that motivated the rubric); this is the
org direction for both repos, not a conway-only experiment. conway
carries the same guidance inline in its
[AGENTS.md](https://github.com/bldrs-ai/conway/blob/main/AGENTS.md)
§"Issue-queue burndowns".

## Roles and models

A **coordinator** session plans, defines issues and manages the
queue; it dispatches one **sub-agent per issue** for the hands-on
work — issue handling, PR authoring, review and release lifecycle.
Use a Fable-class model for the coordinator and Opus-class for the
sub-agents.

Sequence agents that share a branch or files; parallelize only
across disjoint trees. A burndown branch accumulating several
fixes should land as a single PR when the commits are orthogonal —
one CI pass instead of five.

## The dispatch brief

Every brief must carry:

- the branch and its current state (head SHA, commits already on it),
- the verification bar **as numbers** — the suite/test/lint counts
  the tree meets today, so "green" is checkable, not vibes,
- the issue's full context, **and** an instruction to read the live
  issue thread before coding, with explicit license to stop and
  report if the thread has retracted the premise.

Premises rot. Never assert an issue's triage state in a brief without
having read its comments — the burndown lost one dispatch exactly
this way, and the agent that refused to ship against the dead premise
was right to refuse.

## The rubric

1. **Read the thread first.** If comments retract the premise, stop
   and report rather than ship.
2. **Path evidence before claim.** A fix for a specific failure must
   show the failing path reaches the changed code — call chain,
   stack, or captured diagnostic. "Consistent with" is not "caused
   by".
3. **Claim discipline.** State what the change establishes vs. what
   it hopes. No closing keywords, and no `(#N)` in a title, for
   unproven fixes of flaky or statistical bugs — auto-close has
   burned conway#485 twice.
4. **Description ≡ diff.** PR and commit text describe the code as
   it is, not an earlier draft's intent.
5. **No speculative defenses.** Every guard corresponds to a state
   something can actually produce; cite what can throw.
6. **Tests pin the change, not the language.** Prove it: run the new
   tests against a stash/revert of the source change and show them
   fail.
7. **Verify environment assumptions empirically.** Toolchain flags,
   generated-glue behaviour, schema revisions — read the built
   artifact or the pinned source, never memory of a different
   configuration.
8. **Diagnosis before defense** on silent-corruption and flaky bugs.
   A change that makes a symptom vanish without establishing
   mechanism closes an issue while keeping the bug.
9. **Blast-radius discipline.** Outputs the change shouldn't touch
   stay byte-identical (conway: regression digests; Share: existing
   E2E and unit expectations), and the outputs it legitimately
   changes are enumerated precisely — those baselines need
   re-blessing, and the reviewer needs the list.
10. **Report honestly.** Exact counts, verified vs. unverified,
    confounders named.

Reviewers hold the same bar, in this order: verify claims against
the diff (not the description), against repo history, then against
the actual failure path — and grade findings by evidence, not
plausibility.
