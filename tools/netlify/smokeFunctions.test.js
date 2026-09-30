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
import {PROBES, UNPROBED_FUNCTIONS, smokeFunctions} from './smokeFunctions.mjs'


/* eslint-disable no-magic-numbers */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FUNCTIONS_DIR = path.resolve(__dirname, '../../netlify/functions')
const SMOKE_SCRIPT = path.join(__dirname, 'smokeFunctions.mjs')
const NETLIFY_TOML = path.resolve(__dirname, '../../netlify.toml')
const BASE = 'https://smoke.test'


/**
 * @param {string} name function name
 * @return {{status: number, body: string}} the answer its strict probe wants
 */
function strictAnswer(name) {
  const {status, body} = PROBES.find((p) => p.name === name).strict[0]
  return {status, body}
}


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
    let answer = answers[name] ?? fallback ?? strictAnswer(name)
    if (Array.isArray(answer)) {
      answer = answer[Math.min(calls[name], answer.length) - 1]
    }
    if (answer instanceof Error) {
      return Promise.reject(answer)
    }
    return Promise.resolve(new Response(answer.body ?? '', {status: answer.status, headers: answer.headers}))
  }
  impl.calls = calls
  return impl
}


describe('smoke probes match tested behaviour', () => {
  const scenarioIds = new Set(listScenarios().map((s) => s.id))
  const scenarioFile = (id) => listScenarios().find((s) => s.id === id).file

  it('probes every function that is reachable over HTTP', () => {
    const functionNames = fs.readdirSync(FUNCTIONS_DIR, {withFileTypes: true})
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => path.parse(entry.name).name)
    const probed = PROBES.map((p) => p.name)
    expect([...probed, ...Object.keys(UNPROBED_FUNCTIONS)].sort()).toEqual(functionNames.sort())
    expect(probed.filter((name) => name in UNPROBED_FUNCTIONS)).toEqual([])
  })

  // An exemption is only for a function Netlify won't serve over HTTP; a
  // plain function listed here would ship with no deployed check at all.
  it.each(Object.keys(UNPROBED_FUNCTIONS))('%s, left unprobed, is scheduled in netlify.toml', (name) => {
    const toml = fs.readFileSync(NETLIFY_TOML, 'utf8')
    const block = toml.split(/\n(?=\[)/).find((section) => section.startsWith(`[functions."${name}"]`))
    expect(block).toBeDefined()
    expect(block).toMatch(/^\s*schedule\s*=\s*"[^"]+"/m)
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
    expect(probe.strict.map((answer) => answer.status)).toContain(scenario.expect.statusCode)
    expect(probe.accept).toEqual(expect.arrayContaining(probe.strict))
  })

  // A bare status can come from the platform instead of the function (a 404
  // for a function missing from the deploy), so every accepted answer must
  // also name something only the handler says.
  it.each(PROBES.map((p) => [p.name, p]))('%s: every accepted answer names the handler\'s own body or content type', (name, probe) => {
    for (const answer of [...probe.accept, ...probe.strict]) {
      expect(typeof answer.status).toBe('number')
      expect(Boolean(answer.body) || Boolean(answer.contentType)).toBe(true)
    }
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
    const fetchImpl = fakeFetch({'record-load': [{status: 502, body: 'Bad Gateway'}, strictAnswer('record-load')]})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    expect(results.find((r) => r.name === 'record-load')).toMatchObject({ok: true, status: 401})
    expect(fetchImpl.calls['record-load']).toBe(2)
  })

  it('fails a function missing from the deploy, whose 404 is the platform\'s rather than the handler\'s', async () => {
    const fetchImpl = fakeFetch({'pro-module': {status: 404, body: 'Function not found...'}})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    expect(results.find((r) => r.name === 'pro-module')).toMatchObject({ok: false, status: 404})
  })

  it('accepts pro-module\'s own module_not_built 404 from an unconfigured preview', async () => {
    const fetchImpl = fakeFetch({'pro-module': {status: 404, body: '{"error":"module_not_built"}'}})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    expect(results.find((r) => r.name === 'pro-module').ok).toBe(true)
  })

  it('accepts served JavaScript from pro-module only with a JavaScript content type', async () => {
    const js = {status: 200, body: 'export default 1', headers: {'content-type': 'text/javascript; charset=utf-8'}}
    const html = {status: 200, body: '<!doctype html><title>Bldrs</title>', headers: {'content-type': 'text/html'}}

    const served = await smokeFunctions(BASE, {fetchImpl: fakeFetch({'pro-module': js}), retryDelayMs: 0})
    const spaShell = await smokeFunctions(BASE, {fetchImpl: fakeFetch({'pro-module': html}), retryDelayMs: 0})

    expect(served.find((r) => r.name === 'pro-module').ok).toBe(true)
    expect(spaShell.find((r) => r.name === 'pro-module').ok).toBe(false)
  })

  it('fails the right status with someone else\'s body', async () => {
    const fetchImpl = fakeFetch({'unlink-identity': {status: 401, body: 'Unauthorized'}})

    const results = await smokeFunctions(BASE, {fetchImpl, retryDelayMs: 0})

    expect(results.find((r) => r.name === 'unlink-identity')).toMatchObject({ok: false, status: 401})
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
        const {status, body} = strictAnswer(url.pathname.split('/').pop())
        return Promise.resolve(new Response(body, {status}))
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
      const {status, body} = PROBES.find((p) => p.name === name).strict[0]
      res.writeHead(status)
      res.end(body)
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
