#!/usr/bin/env node
/* eslint-disable no-console */
// The layer allowlist only shrinks (design/tracks/open-t200/layering.md §5,
// "The ratchet", check 2). A step of main.yml's `build` job on pull requests:
// it compares tools/lint/layerAllowlist.json with the base branch's and fails
// on any (file, import) pair the base does not have, so a new upward import
// fails `bun run lint` locally and cannot be bought with an allowlist edit.
// Removing pairs is the point; src/layerBoundary.test.js fails on a pair whose
// import has gone.
//
// Usage: node tools/lint/checkLayerAllowlist.mjs <base-ref>
//
// On a pull_request event Actions checks out the merge of the PR into its
// base, so comparing with the base branch's tip is the PR's own change. A base
// with no allowlist yet (the PR that adds it) has nothing to compare against
// and passes.
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'


const ALLOWLIST = 'tools/lint/layerAllowlist.json'
const SECTION = 'design/tracks/open-t200/layering.md §5 "The ratchet"'


/**
 * @param {object} base the base branch's allowlist, `{file: [imports]}`
 * @param {object} head this tree's allowlist
 * @return {Array<Array<string>>} `[file, import]` pairs in head and not base
 */
export function addedPairs(base, head) {
  const had = new Set(Object.entries(base).flatMap(([file, imports]) => imports.map((imp) => `${file}\0${imp}`)))
  return Object.entries(head)
    .flatMap(([file, imports]) => imports.map((imp) => [file, imp]))
    .filter(([file, imp]) => !had.has(`${file}\0${imp}`))
}


/**
 * @param {string} baseRef a git ref
 * @param {string} cwd repo root
 * @return {object|null} the allowlist at that ref, or null when it has none
 */
function allowlistAt(baseRef, cwd) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${baseRef}:${ALLOWLIST}`],
      {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}))
  } catch (err) {
    if (/does not exist|exists on disk, but not in/.test(String(err.stderr))) {
      return null
    }
    throw err
  }
}


/**
 * @param {Array<string>} argv
 * @return {number} the exit code
 */
export function main(argv) {
  const baseRef = argv[0]
  if (!baseRef) {
    console.error('usage: checkLayerAllowlist.mjs <base-ref>')
    return 2
  }
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const head = JSON.parse(fs.readFileSync(path.join(cwd, ALLOWLIST), 'utf8'))
  const base = allowlistAt(baseRef, cwd)
  if (base === null) {
    console.log(`${ALLOWLIST}: ${baseRef} has none yet; nothing to compare`)
    return 0
  }
  const added = addedPairs(base, head)
  if (added.length > 0) {
    console.error(`${ALLOWLIST} gained ${added.length} upward import(s) that ${baseRef} does not allow:`)
    for (const [file, imp] of added) {
      console.error(`  ${file} -> ${imp}`)
    }
    console.error(`The list only shrinks (${SECTION}): route the import through a lower layer or an ` +
      'injected callback instead of allowlisting it.')
    return 1
  }
  console.log(`${ALLOWLIST}: no new upward imports against ${baseRef}`)
  return 0
}


if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2))
}
