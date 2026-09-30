/*
 * Replays every scenario in `replay/` against the function SOURCE.
 *
 * A scenario is a recorded conversation: the request a function receives,
 * each outbound call it makes to Auth0 / Stripe / GitHub / Google Drive with
 * the upstream's answer, and the response it must give (format:
 * replay/README.md). This suite runs them against `netlify/functions/*.js`
 * under real Node ESM; tools/netlify/functionBundler.test.js runs the same
 * files against the bundles a deploy would ship, which is where
 * bldrs-ai/ops#33 lived. A scenario that passes here and fails there is a
 * packaging bug, not a logic bug.
 *
 * Each scenario runs in a child process (tools/netlify/replay/runScenario.mjs)
 * because functions read env and cache tokens at module scope, and because
 * babel-jest would otherwise transform the module format away (see
 * esmLoad.test.js). The children run concurrently in `beforeAll`; each `it`
 * only reports its scenario's result.
 */
import {readdirSync} from 'fs'
import path from 'path'
import {listScenarios} from '../../../tools/netlify/replay/scenario.mjs'
import {replayAll} from '../../../tools/netlify/replay/replayAll.mjs'


const FUNCTIONS_DIR = path.resolve(__dirname, '..')
const REPLAY_TIMEOUT_MS = 120000
const scenarios = listScenarios()


describe('netlify functions replay recorded traffic (source)', () => {
  let results

  beforeAll(async () => {
    results = await replayAll(scenarios.map((scenario) => ({
      id: scenario.id,
      file: scenario.file,
      entry: path.join(FUNCTIONS_DIR, `${scenario.functionName}.js`),
      loadMode: 'import',
    })))
  }, REPLAY_TIMEOUT_MS)

  // A new function has to arrive with at least one scenario — including the
  // unauthenticated probe the deployed smoke test sends
  // (tools/netlify/smokeFunctions.mjs) — or it ships with no replay at the
  // bundle level either.
  it('has scenarios for every function', () => {
    const functionNames = readdirSync(FUNCTIONS_DIR, {withFileTypes: true})
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => path.parse(entry.name).name)
    const covered = new Set(scenarios.map((scenario) => scenario.functionName))
    expect(functionNames.filter((name) => !covered.has(name))).toEqual([])
    expect([...covered].filter((name) => !functionNames.includes(name))).toEqual([])
  })

  it.each(scenarios.map((scenario) => scenario.id))('%s', (id) => {
    expect(results.get(id).failures).toEqual([])
  })
})
