#!/usr/bin/env bash
#
# Netlify [build].ignore hook — exit 0 to SKIP the build, exit 1 to BUILD.
# We skip when every file changed since the last successful deploy is a
# documentation file (markdown anywhere, or anything under design/ or
# notes/). On any failure or ambiguity we err toward building so the
# branch never ends up un-deployed.
#
# Netlify supplies $CACHED_COMMIT_REF (last successful deploy) and
# $COMMIT_REF (current). See https://docs.netlify.com/configure-builds/ignore-builds/.

set -u

# Build defensively if we can't compute a diff (shallow clone, fresh site, …).
if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ]; then
  exit 1
fi

files=$(git diff --name-only "$CACHED_COMMIT_REF" "$COMMIT_REF" 2>/dev/null) || exit 1

# Empty diff (e.g. force-push to same SHA) — build to be safe.
[ -z "$files" ] && exit 1

# If any changed file is NOT a doc, we need to build.
if echo "$files" | grep -qvE '(\.md$|^design/|^notes/)'; then
  exit 1
fi

# All changes are docs — skip.
exit 0
