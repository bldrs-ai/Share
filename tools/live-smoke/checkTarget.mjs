#!/usr/bin/env node
/**
 * Validate a live smoke target against the allow-list, for live-smoke.yml.
 *
 *   node tools/live-smoke/checkTarget.mjs <url>
 *
 * Prints the normalised origin and exits 0 when the URL is allowed; prints
 * why not and exits 1 otherwise. `CI=true` refuses localhost. The workflow
 * runs this before any step that is given a secret.
 */
import {checkLiveTarget} from './targets.js'


/**
 * @param {Array<string>} argv
 * @param {object} env `process.env`, or a stand-in
 * @param {object} [io]
 * @param {{write: function(string): *}} [io.stdout]
 * @param {{write: function(string): *}} [io.stderr]
 * @return {number} exit code
 */
export function main(argv, env, {stdout = process.stdout, stderr = process.stderr} = {}) {
  const raw = argv.find((arg) => !arg.startsWith('--'))
  if (!raw) {
    stderr.write('usage: checkTarget.mjs <url>\n')
    return 1
  }
  const vars = /** @type {Record<string, string|undefined>} */ (env)
  const {origin, problem} = checkLiveTarget(raw, {isCI: vars.CI === 'true'})
  if (origin === null) {
    stderr.write(`${problem}\n`)
    return 1
  }
  stdout.write(`${origin}\n`)
  return 0
}


const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  process.exit(main(process.argv.slice(2), process.env))
}
