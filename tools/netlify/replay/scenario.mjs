/*
 * Replay scenarios for Netlify Functions: load, resolve, and judge them.
 *
 * A scenario is one recorded conversation a function has — the request it
 * receives, every outbound HTTP exchange it makes (Auth0, Stripe, GitHub,
 * Google Drive) with the upstream's answer, and the response it must give.
 * The same file is replayed at two levels:
 *
 *  - against the SOURCE, by netlify/functions/_tests/replaySource.test.js
 *    (Node ESM, repo `node_modules`), for fast feedback on behaviour;
 *  - against the BUNDLE Netlify would ship, by
 *    tools/netlify/functionBundler.test.js, which is what would have caught
 *    bldrs-ai/ops#33: axios crashing at request time inside a bundle that
 *    source-level tests (and even a bare load check) called healthy.
 *
 * runScenario.mjs does the replaying, in a child process; this module is the
 * part both sides share. The file format is documented in
 * netlify/functions/_tests/replay/README.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'


const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const SCENARIO_ROOT = path.join(REPO_ROOT, 'netlify', 'functions', '_tests', 'replay')
export const FIXTURE_ROOT = path.join(SCENARIO_ROOT, 'fixtures')

// Printed by runScenario.mjs before its JSON result, so a function's own
// console.log output on stdout can't be mistaken for it.
export const RESULT_MARKER = 'REPLAY_RESULT '


/**
 * Every scenario, as `{id, functionName, file}`, where `id` is
 * `<function>/<scenario>` and the directory names the function.
 *
 * @return {Array<{id: string, functionName: string, file: string}>}
 */
export function listScenarios() {
  return fs.readdirSync(SCENARIO_ROOT, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && entry.name !== 'fixtures')
    .flatMap((dir) => fs.readdirSync(path.join(SCENARIO_ROOT, dir.name))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => ({
        id: `${dir.name}/${path.parse(name).name}`,
        functionName: dir.name,
        file: path.join(SCENARIO_ROOT, dir.name, name),
      })))
}


/**
 * Read a scenario and replace every `{"$fixture": "<path>"}` with the parsed
 * contents of `fixtures/<path>`, recursively, so recorded payloads (a Stripe
 * event, an Auth0 user) are written once and shared. `{"$fixturePath":
 * "<path>"}` is replaced by the ABSOLUTE path of `fixtures/<path>` instead —
 * for an env var that has to name a directory, which a scenario can't spell
 * portably (the replay runs from the repo for source and from a temp dir for
 * the bundle).
 *
 * @param {string} file
 * @return {object}
 */
export function loadScenario(file) {
  return resolveFixtures(JSON.parse(fs.readFileSync(file, 'utf8')), [])
}


/**
 * @param {*} value
 * @param {Array<string>} stack fixture paths being resolved, for cycle errors
 * @return {*}
 */
function resolveFixtures(value, stack) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveFixtures(item, stack))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (typeof value.$fixturePath === 'string') {
    if (Object.keys(value).length > 1) {
      throw new Error(`$fixturePath ${value.$fixturePath}: nothing may sit beside it`)
    }
    return path.join(FIXTURE_ROOT, value.$fixturePath)
  }
  if (typeof value.$fixture === 'string') {
    const {$fixture: ref, $merge: merge, ...rest} = value
    if (Object.keys(rest).length > 0) {
      throw new Error(`$fixture ${ref}: only $merge may sit beside it, found ${Object.keys(rest).join(', ')}`)
    }
    if (stack.includes(ref)) {
      throw new Error(`$fixture cycle: ${[...stack, ref].join(' → ')}`)
    }
    const loaded = resolveFixtures(JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, ref), 'utf8')), [...stack, ref])
    return merge === undefined ? loaded : deepMerge(loaded, resolveFixtures(merge, stack))
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveFixtures(item, stack)]))
}


/**
 * `$merge` overlays a variant onto a shared fixture — the Pro event is the
 * base event with one price id changed. Objects merge key by key; anything
 * else (arrays included) is replaced whole.
 *
 * @param {*} base
 * @param {*} overlay
 * @return {*}
 */
function deepMerge(base, overlay) {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return overlay
  }
  const merged = {...base}
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value
  }
  return merged
}


/**
 * @param {*} value
 * @return {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}


/**
 * Where `actual` departs from `expected`, as human-readable lines. Objects
 * match as subsets (keys the scenario doesn't name are ignored), arrays by
 * length and position, anything else by `===`.
 *
 * @param {*} actual
 * @param {*} expected
 * @param {string} label where in the result this is, for the message
 * @return {Array<string>} empty when it matches
 */
export function subsetMismatches(actual, expected, label) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return [`${label}: expected an array, got ${JSON.stringify(actual)}`]
    }
    if (actual.length !== expected.length) {
      return [`${label}: expected ${expected.length} items, got ${actual.length}: ${JSON.stringify(actual)}`]
    }
    return expected.flatMap((item, i) => subsetMismatches(actual[i], item, `${label}[${i}]`))
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      return [`${label}: expected an object, got ${JSON.stringify(actual)}`]
    }
    return Object.entries(expected).flatMap(([key, item]) => subsetMismatches(actual[key], item, `${label}.${key}`))
  }
  return actual === expected ? [] : [`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`]
}


/**
 * Judge a handler's response against `scenario.expect`.
 *
 * @param {{statusCode: number, headers: object, body: string}} response
 * @param {object} expect `{statusCode, bodyIncludes?, json?, headers?}`
 * @return {Array<string>}
 */
export function responseMismatches(response, expect) {
  const failures = []
  if (response.statusCode !== expect.statusCode) {
    failures.push(`response status: expected ${expect.statusCode}, got ${response.statusCode} (body: ${truncate(response.body)})`)
  }
  if (expect.bodyIncludes !== undefined && !String(response.body).includes(expect.bodyIncludes)) {
    failures.push(`response body: expected to include ${JSON.stringify(expect.bodyIncludes)}, got ${truncate(response.body)}`)
  }
  if (expect.json !== undefined) {
    let parsed
    try {
      parsed = JSON.parse(response.body)
    } catch {
      failures.push(`response body: expected JSON, got ${truncate(response.body)}`)
    }
    if (parsed !== undefined) {
      failures.push(...subsetMismatches(parsed, expect.json, 'response json'))
    }
  }
  if (expect.headers !== undefined) {
    const lower = Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), v]))
    for (const [name, value] of Object.entries(expect.headers)) {
      if (lower[name.toLowerCase()] !== value) {
        failures.push(`response header ${name}: expected ${JSON.stringify(value)}, got ${JSON.stringify(lower[name.toLowerCase()])}`)
      }
    }
  }
  return failures
}


const TRUNCATE_AT = 300


/**
 * @param {*} text
 * @return {string}
 */
function truncate(text) {
  const str = String(text)
  return str.length > TRUNCATE_AT ? `${str.slice(0, TRUNCATE_AT)}…` : str
}
