---
name: git-network-timeouts
description: Always use a long timeout (≥120s) for git network operations; never assume partial/timed-out output is success
type: feedback
---

Never set short timeouts on git network operations (push, pull, fetch, clone). A 30s timeout can kill the process mid-run and return partial/garbage output that looks like success. Always use at least 120000ms for these commands.

**Why:** A timed-out `git push` produced output with a bogus remote URL (`rpstohr-prim/Share.git`) that was mistakenly read as success. The commit had not actually pushed.

**How to apply:** For any Bash call involving `git push`, `git pull`, `git fetch`, or `git clone`, use `timeout: 120000` or higher. After pushing, verify with `git log origin/branch` or `git status` rather than trusting the push output alone.
