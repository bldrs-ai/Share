/*
 * Tests for the deployed-function smoke test (smokeFunctions.mjs).
 *
 * Two jobs. First, keep its contract honest: every function has a probe,
 * and every probe sends exactly the request of a replay scenario whose
 * expected answer the probe accepts — so the answer the smoke test demands
 * of production is one the source and the bundle are already tested to
 * give. Second, prove it FAILS when it should (a crash, a platform error, a
 * wrong status, an unreachable host) and doesn't when it shouldn't (one
 * transient 502). That it passes against real bundles is checked in
 * functionBundler.test.js.
 */
import {execFile} from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {listScenarios, loadScenario} from './replay/scenario.mjs'
import {PROBES, smokeFunctions} from './smokeFunctions.mjs'


/* eslint-disable no-magic-numbers */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FUNCTIONS_DIR = path.resolve(__dirname, '../../netlify/functions')
const SMOKE_SCRIPT = path.join(__dirname, 'smokeFunctions.mjs')
const BASE = 'https://smoke.test'


/**
 * A fetch stand-in answering each function from `answers[name]`, which is a
 * `{status, body}` or a list of them consumed one per call (for retries).
 *
 * @param {object} answers
 * @param {object} [fallback] answer for functions not in `answers`
 * @return {Function} fetch, with `.calls` counting requests per function
 */
function fakeFetch(answers, fallback) {
  const calls = {}
  const impl = (url) => {
    const name = new URL(url).pathname.split('/').pop()
    calls[name] = (calls[name] || 0) + 1
    let answer = answers[name] ?? fallback ?? {status: PROBES.find((p) => p.name === name).strict[0], body: ''}
    if (Array.isArray(answer)) {
      answer = answer[Math.min(calls[name], answer.length) - 1]
    }
    if (answer instanceof Error) {
      return Promise.reject(answer)
    }
    return Promise.resolve(new Response(answer.body ?? '', {status: answer.status}))
  }
  impl.calls = calls
  return impl
}


describe('smoke probes match tested behaviour', () => {
  const scenarioIds = new Set(listScenarios().map((s) => s.id))
  const scenarioFile = (id) => listScenarios().find((s) => s.id === id).file

  it('probes every function', () => {
    const functionNames = fs.readdirSync(FUNCTIONS_DIR, {withFileTypes: true})
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => path.parse(entry.name).name)
    expect(PROBES.map((p) => p.name).sort()).toEqual(functionNames.sort())
  })

  it.each(PROBES.map((p) => [p.name, p]))('%s: sends its replay scenario\'s request, accepts its answer', (name, probe) => {
    expect(scenarioIds.has(probe.scenario)).toBe(true)
    const scenario = loadScenario(scenarioFile(probe.scenario))
    expect(scenario.request.path).toBe(`/.netlify/functions/${name}`)
    expect(scenario.request.method).toBe(probe.method)
    expect(scenario.request.query).toEqual(probe.query)
    expect(scenario.request.body).toEqual(probe.body)
    // Credentials are exactly what a probe must not send.
    expect(Object.keys(scenario.request.headers || {}).map((h) => h.toLowerCase())).not.toContain('authorization')
    // Scenario env is fully configured, so its answer is the strict one.
    expect(probe.strict).toContain(scenario.expect.statusCode)
    expect(probe.accept).toEqual(expect.arrayContaining(probe.strict))
  })
})


describe('smokeFunctions', () => {
  it('passes when every function gives its expected answer', async () => {
    const results = await smokeFunctions(BASE, {strict: true, fetchImpl: fakeFetch({}), retryDelayMs: 0})
    expect(results.filter((r) => !r.ok)).toEqual([])
  })

  it('fails a function whose bundle did not load, naming it, after one retry', async () => {
    const importError = {
      status: 502,
      body: JSON.stringify({
        errorType: 'Runtime.ImportModuleError',
        errorMessage: 'Cannot find module \'/var/task/node_modules/axios/dist/node/axios.cjs\'',
      }),
    }
    const fetchImpl = fakeFetch({'stripe-webhook': importError})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    const failed = results.filter((r) => !r.ok)
    expect(failed.map((r) => r.name)).toEqual(['stripe-webhook'])
    expect(failed[0].detail).toContain('did not run')
    expect(failed[0].detail).toContain('axios.cjs')
    expect(fetchImpl.calls['stripe-webhook']).toBe(2)
  })

  it('forgives a single transient 502', async () => {
    const fetchImpl = fakeFetch({'record-load': [{status: 502, body: 'Bad Gateway'}, {status: 401, body: ''}]})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    expect(results.find((r) => r.name === 'record-load')).toMatchObject({ok: true, status: 401})
    expect(fetchImpl.calls['record-load']).toBe(2)
  })

  it('fails a Lambda error body even under an accepted status', async () => {
    const fetchImpl = fakeFetch({'proxy-handler': {status: 400, body: '{"errorType":"TypeError","errorMessage":"x is not a function"}'}})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    expect(results.find((r) => r.name === 'proxy-handler')).toMatchObject({ok: false})
  })

  it('fails an unreachable host', async () => {
    const results = await smokeFunctions(BASE, {fetchImpl: fakeFetch({}, new TypeError('fetch failed')), retryDelayMs: 0})

    expect(results.every((r) => !r.ok && r.detail.includes('request failed'))).toBe(true)
  })

  it('accepts "not configured" from a preview, but not in strict (production) mode', async () => {
    const answers = {'gh-oauth-exchange': {status: 500, body: 'GH_OAUTH_CLIENT_ID/SECRET not configured'}}

    const lenient = await smokeFunctions(BASE, {fetchImpl: fakeFetch(answers), retryDelayMs: 0})
    const strict = await smokeFunctions(BASE, {strict: true, fetchImpl: fakeFetch(answers), retryDelayMs: 0})

    expect(lenient.find((r) => r.name === 'gh-oauth-exchange').ok).toBe(true)
    expect(strict.find((r) => r.name === 'gh-oauth-exchange')).toMatchObject({ok: false, status: 500})
  })

  it('sends no credentials', async () => {
    const seen = []
    await smokeFunctions(BASE, {
      retryDelayMs: 0,
      fetchImpl: (url, init) => {
        seen.push(init.headers)
        return Promise.resolve(new Response('', {status: PROBES.find((p) => url.pathname.endsWith(p.name)).strict[0]}))
      },
    })
    for (const headers of seen) {
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization')
    }
  })
})


describe('smokeFunctions.mjs CLI', () => {
  let server
  let baseUrl
  let broken

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const name = req.url.split('?')[0].split('/').pop()
      if (name === broken) {
        res.writeHead(502, {'content-type': 'application/json'})
        res.end('{"errorType":"Runtime.ImportModuleError","errorMessage":"Cannot find module"}')
        return
      }
      res.writeHead(PROBES.find((p) => p.name === name).strict[0])
      res.end()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  /**
   * @param {Array<string>} args
   * @return {Promise<{code: number, stdout: string}>}
   */
  function runCli(args) {
    return new Promise((resolve) => {
      execFile(process.execPath, [SMOKE_SCRIPT, ...args], {env: {PATH: process.env.PATH}}, (err, stdout) => {
        resolve({code: err ? err.code : 0, stdout: String(stdout)})
      })
    })
  }

  it('exits 0 and reports all passed when every function answers', async () => {
    broken = null
    const {code, stdout} = await runCli([baseUrl, '--strict'])
    expect(stdout).toContain('all passed')
    expect(code).toBe(0)
  })

  it('exits 1 and names the function that could not start', async () => {
    broken = 'unlink-identity'
    // The CLI's own retry waits 5 s before failing a crash for good.
    const {code, stdout} = await runCli([baseUrl, '--strict'])
    expect(stdout).toContain('1 of 9 FAILED')
    expect(stdout).toMatch(/\| unlink-identity \| 502 \|.*FAIL/)
    expect(code).toBe(1)
  }, 30000)
})
