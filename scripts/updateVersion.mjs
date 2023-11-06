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

const pkgJsonFilename = 'package.json'
const gitRevCountCmd = 'git rev-list HEAD --count'
const versionPattern =
      /^(?<indent>\s*)"version"\s*:\s*"(?<major>\d+)\.(?<minor>\d+)\.\d+"\s*(?<comma>,)?$/m

// Calculate new semver patch as revision count + 1
const revisionCount = parseInt(execSync(gitRevCountCmd).toString().trim())
const newPatch = revisionCount + 1

// Read package.json and replace version
const file = fs.readFileSync(pkgJsonFilename).toString('utf8')
const updatedFile =
      file.replace(versionPattern, `$<indent>"version": "$<major>.$<minor>.${newPatch}"$<comma>`)

// Rewrite package.json with new content.
fs.writeFileSync(pkgJsonFilename, updatedFile)
