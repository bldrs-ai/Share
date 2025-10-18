#!/usr/bin/env node
import {execSync} from 'node:child_process'
import fs from 'fs'


/**
 * Rewrites package.json semver "patch" to git's version count + 1.
 *
 * Usage: "./scripts/updateVersion.js"
 *
 * @see git rev-list HEAD --count
 * @see https://semver.org/
 */

const gitRevCountCmd = 'git rev-list HEAD --count'
// Calculate new semver patch as revision count + 1
const revisionCount = parseInt(execSync(gitRevCountCmd).toString().trim())
const newPatch = revisionCount + 1

/**
 * In-place rewrite of the file content to update the version string
 *
 * @param {string} filename
 * @param {RegExp} versionPattern Including groups for backrefs
 * @param {string} replaceWithGroups Replacement string using backrefs
 */
function rewriteVersion(filename, versionPattern, replaceWithGroups) {
  // Read package.json and replace version
  const file = fs.readFileSync(filename).toString('utf8')
  const updatedFile = file.replace(versionPattern, replaceWithGroups)

  // Rewrite package.json with new content.
  fs.writeFileSync(filename, updatedFile)
}

// Rewrite line like:
//
//   "version": "0.1.370",
rewriteVersion(
  'package.json',
  /^(?<indent>\s*)"version"\s*:\s*"(?<major>\d+)\.(?<minor>\d+)\.\d+"\s*(?<trailingComma>,)?$/m,
  `$<indent>"version": "$<major>.$<minor>.${newPatch}"$<trailingComma>`,
)
