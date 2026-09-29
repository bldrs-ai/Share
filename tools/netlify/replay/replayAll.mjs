/*
 * Run many replay scenarios, a bounded number at a time, each in its own
 * child process (runScenario.mjs). Shared by the source-level suite
 * (netlify/functions/_tests/replaySource.test.js) and the bundle-level one
 * (tools/netlify/functionBundler.test.js), which differ only in which entry
 * file a scenario is pointed at and where the child runs.
 */
import {execFile} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {RESULT_MARKER} from './scenario.mjs'


const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runScenario.mjs')
const DEFAULT_TIMEOUT_MS = 60000
const MAX_CONCURRENCY = 8
// A scenario's result echoes every outbound call and body.
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024 // eslint-disable-line no-magic-numbers


/**
 * @param {Array<object>} jobs `{id, file, entry, loadMode: 'require'|'import', cwd}`
 * @param {object} [options]
 * @param {object} [options.env] the child's environment (the runner then
 *   replaces it with the scenario's own, keeping PATH)
 * @param {number} [options.timeoutMs]
 * @return {Promise<Map<string, object>>} `{failures, response, calls}`
 *   keyed by job id; a child that crashed or printed no result is reported
 *   as a single failure carrying its stderr
 */
export async function replayAll(jobs, {env = {PATH: process.env.PATH}, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
  const results = new Map()
  const queue = [...jobs]
  const concurrency = Math.max(1, Math.min(os.availableParallelism ? os.availableParallelism() : os.cpus().length, MAX_CONCURRENCY))
  const workers = Array.from({length: concurrency}, async () => {
    while (queue.length > 0) {
      const job = queue.shift()
      results.set(job.id, await replayOne(job, env, timeoutMs))
    }
  })
  await Promise.all(workers)
  return results
}


/**
 * @param {object} job
 * @param {object} env
 * @param {number} timeoutMs
 * @return {Promise<object>}
 */
function replayOne(job, env, timeoutMs) {
  return new Promise((resolve) => {
    execFile(process.execPath, [RUNNER, job.file, job.entry, job.loadMode], {
      cwd: job.cwd,
      env,
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
    }, (err, stdout, stderr) => {
      const line = String(stdout).split('\n').reverse().find((l) => l.startsWith(RESULT_MARKER))
      if (line) {
        resolve(JSON.parse(line.slice(RESULT_MARKER.length)))
        return
      }
      resolve({failures: [`replay runner produced no result (${err ? err.message : 'exit 0'}):\n${stderr}`]})
    })
  })
}
