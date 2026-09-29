/*
 * The replay runner must fail loudly on every kind of mismatch, or the
 * scenario suites (netlify/functions/_tests/replaySource.test.js, and the
 * bundle replay in tools/netlify/functionBundler.test.js) would pass
 * vacuously. Each case below feeds a deliberately wrong scenario to a
 * stand-in function (__fixtures__/echoFunction.mjs) and asserts the runner
 * names the mistake; the first case is the control that must pass.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {replayAll} from './replayAll.mjs'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ECHO = path.join(__dirname, '__fixtures__', 'echoFunction.mjs')
const TIMEOUT_MS = 60000

const EXCHANGE = {
  request: {
    method: 'POST',
    url: 'https://upstream.test/thing',
    headers: {authorization: 'Bearer upstream-token'},
    body: {n: 1, from: 'replay'},
  },
  response: {status: 200, json: {v: 42}},
}
const BASE = {
  env: {WHO: 'replay'},
  request: {method: 'GET', path: '/.netlify/functions/echo', headers: {}},
  exchanges: [EXCHANGE],
  expect: {statusCode: 200, json: {got: 42, method: 'GET'}, headers: {'x-echo': 'yes'}},
}

// [case, scenario overrides, substring the FIRST failure must contain]. Later
// failures can follow from the first (an unlisted call answered with the
// runner's 599 placeholder then breaks the function too).
const CASES = [
  ['matching scenario passes', {}, null],
  ['wrong status', {expect: {...BASE.expect, statusCode: 201}}, 'response status: expected 201, got 200'],
  ['wrong json field', {expect: {statusCode: 200, json: {got: 43}}}, 'response json.got: expected 43, got 42'],
  ['wrong header', {expect: {statusCode: 200, headers: {'x-echo': 'no'}}}, 'response header x-echo'],
  ['body not included', {expect: {statusCode: 200, bodyIncludes: 'absent'}}, 'expected to include "absent"'],
  ['outbound not in scenario', {exchanges: []}, 'not in the scenario'],
  ['expected outbound never made', {exchanges: [EXCHANGE, EXCHANGE]}, 'expected but never made'],
  ['wrong outbound url', {exchanges: [{...EXCHANGE, request: {...EXCHANGE.request, url: 'https://upstream.test/other'}}]},
    'expected POST https://upstream.test/other'],
  ['wrong outbound body', {exchanges: [{...EXCHANGE, request: {...EXCHANGE.request, body: {n: 2}}}]}, 'body.n: expected 2, got 1'],
  ['wrong outbound header', {exchanges: [{...EXCHANGE, request: {...EXCHANGE.request, headers: {authorization: 'Bearer nope'}}}]},
    'header authorization'],
  ['env is the scenario\'s own', {env: {WHO: 'someone-else'}}, 'body.from: expected "replay", got "someone-else"'],
  ['handler throws', {request: {...BASE.request, query: {throw: '1'}}}, 'handler threw: Error: boom'],
]


describe('replay runner reports every mismatch', () => {
  let dir
  let results

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bldrs-replay-meta-'))
    results = await replayAll(CASES.map(([name, overrides], i) => {
      const file = path.join(dir, `case-${i}.json`)
      fs.writeFileSync(file, JSON.stringify({...BASE, ...overrides}))
      return {id: name, file, entry: ECHO, loadMode: 'import'}
    }))
  }, TIMEOUT_MS)

  afterAll(() => {
    fs.rmSync(dir, {recursive: true, force: true})
  })

  it.each(CASES)('%s', (name, overrides, expectedFailure) => {
    const {failures} = results.get(name)
    if (expectedFailure === null) {
      expect(failures).toEqual([])
    } else {
      expect(failures.length).toBeGreaterThan(0)
      expect(failures[0]).toContain(expectedFailure)
    }
  })
})
