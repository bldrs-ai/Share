#!/usr/bin/env node
import {execSync} from 'node:child_process'
import fs from 'fs'


/**
 * Rewrites package.json version to `<major>.<PR>.<short-sha>`:
 *  - <major>: preserved from package.json — bumped manually via a
 *    package.json edit.
 *  - <PR>: PR number — `REVIEW_ID` from Netlify deploy-preview builds,
 *    else the PR number parsed out of the most recent merge commit
 *    on HEAD's history (production builds from main, since the
 *    repo's merge style is "Create merge commit" with the standard
 *    "Merge pull request #NNNN ..." subject), else 0 for local/dev
 *    builds with no merge ancestor.
 *  - <short-sha>: `git rev-parse --short HEAD` — the abbreviated
 *    commit hash. Git auto-grows it if a 7-char prefix is ambiguous
 *    (very rare), so the field width is not fixed. Chosen over a
 *    commit *count* because the count depends on clone depth — both
 *    Netlify CI and our sandboxes do shallow clones, so the count
 *    underreports and isn't stable across environments.
 *
 * The point of folding PR# into the version is that the version
 * is also our Sentry release tag — so a crash report's release can
 * be mapped back to the PR that shipped it without a separate
 * lookup. The short SHA gives the same trick for the build slot:
 * paste it straight into `git show` to land on the exact commit.
 *
 * Usage: `./tools/updateVersion.mjs`
 *
 * @see git rev-parse --short HEAD
 * @see https://semver.org/
 */

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()

/**
 * Resolve the PR number for the current build. Netlify deploy
 * previews set REVIEW_ID; main builds fall back to parsing the most
 * recent "Merge pull request #NNNN ..." commit reachable from HEAD.
 *
 * @return {number} PR number, or 0 if none can be determined
 */
function detectPrNumber() {
  if (process.env.REVIEW_ID) {
    const reviewId = parseInt(process.env.REVIEW_ID, 10)
    if (!isNaN(reviewId)) {
      return reviewId
    }
  }
  try {
    const subject = execSync(
      'git log -1 --merges --grep=^"Merge pull request #" --pretty=%s',
      {stdio: ['ignore', 'pipe', 'ignore']},
    ).toString().trim()
    const match = subject.match(/^Merge pull request #(\d+)/)
    if (match) {
      return parseInt(match[1], 10)
    }
  } catch {
    // git not available or no matching ancestor — fall through to 0
  }
  return 0
}

const prNumber = detectPrNumber()

/**
 * In-place rewrite of the file content to update the version string
 *
 * @param {string} filename
 * @param {RegExp} versionPattern Including groups for backrefs
 * @param {string} replaceWithGroups Replacement string using backrefs
 */
function rewriteVersion(filename, versionPattern, replaceWithGroups) {
  const file = fs.readFileSync(filename).toString('utf8')
  const updatedFile = file.replace(versionPattern, replaceWithGroups)
  fs.writeFileSync(filename, updatedFile)
}

// Rewrite line like:
//
//   "version": "1.1522.b0617df",
//
// The third slot accepts both the new alphanumeric short-SHA form
// and the legacy numeric counter so the regex still matches a
// just-checked-out package.json after this script ships.
rewriteVersion(
  'package.json',
  /^(?<indent>\s*)"version"\s*:\s*"(?<major>\d+)\.\d+\.[A-Za-z0-9]+"\s*(?<trailingComma>,)?$/m,
  `$<indent>"version": "$<major>.${prNumber}.${commitHash}"$<trailingComma>`,
)
