#!/usr/bin/env node
/*
 * Replays one scenario against one Netlify Function entry, in this process,
 * and prints `REPLAY_RESULT {failures, response, calls}` on stdout.
 *
 *   node tools/netlify/replay/runScenario.mjs <scenario.json> <entry> <require|import>
 *
 * `<entry>` is either a source file (netlify/functions/<name>.js) or a
 * bundled one from tools/netlify/bundleFunctions.mjs. `require` loads it the
 * way Lambda loads a v1 `.js` entry (require, falling back to import() only
 * on ERR_REQUIRE_ESM), which keeps a CommonJS bundle on the CommonJS
 * resolution path where nft's missing `axios.cjs` is looked up; `import`
 * is for source and for a v2 bundle's `functions/<name>.mjs`.
 *
 * Meant to run as a child process, one per scenario:
 *  - process.env is replaced with the scenario's `env` (plus PATH) BEFORE
 *    the function is imported, since functions read env at module scope
 *    (Sentry init) and cache tokens there;
 *  - msw intercepts every outbound request — axios's http adapter, the
 *    Stripe SDK's https client, global fetch — whether it comes from source
 *    or from a bundle, because all of them end at Node's own `http`/`https`/
 *    `fetch`, which msw patches. A request the scenario doesn't list is a
 *    failure, never a real network call.
 *
 * This file and scenario.mjs import from the repo's `node_modules` (msw,
 * stripe for test signatures). That doesn't leak into a bundle under test:
 * Node resolves each `require` relative to the file that makes it, so the
 * bundle still sees only what it shipped.
 */
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {setupServer} from 'msw/node'
import {http, HttpResponse} from 'msw'
import {RESULT_MARKER, loadScenario, responseMismatches, subsetMismatches} from './scenario.mjs'


const LAMBDA_REMAINING_MS = 10000
const NO_EXCHANGE_STATUS = 599


const [scenarioFile, entry, loadMode] = process.argv.slice(2)
if (!scenarioFile || !entry || !['require', 'import'].includes(loadMode)) {
  console.error('usage: runScenario.mjs <scenario.json> <entry> <require|import>')
  process.exit(2)
}

const scenario = loadScenario(scenarioFile)
const failures = []
const calls = []

for (const name of Object.keys(process.env)) {
  if (name !== 'PATH') {
    delete process.env[name]
  }
}
Object.assign(process.env, scenario.env || {})

const exchanges = scenario.exchanges || []
// 'strict' (default): calls must arrive in the listed order. 'any': for a
// function that works on several items concurrently, where the interleaving
// across items is timing-dependent — each call takes the first unused
// exchange with its method and URL, so calls to the SAME URL (a read, then
// its read-after-write) are still consumed in the listed order.
const anyOrder = scenario.exchangeOrder === 'any'
const used = new Set()
const server = setupServer(http.all('*', async ({request}) => {
  const call = {method: request.method, url: request.url, body: await readBody(request)}
  calls.push(call)
  const index = anyOrder ?
    exchanges.findIndex((candidate, i) => !used.has(i) &&
      candidate.request.method === call.method && candidate.request.url === call.url) :
    exchanges.findIndex((candidate, i) => !used.has(i))
  const exchange = index === -1 ? undefined : exchanges[index]
  const label = `outbound #${calls.length} (${call.method} ${call.url})`
  if (!exchange) {
    failures.push(`${label}: not in the scenario`)
    return HttpResponse.text('no such exchange in the replay scenario', {status: NO_EXCHANGE_STATUS})
  }
  used.add(index)
  const want = exchange.request
  if (want.method !== call.method || want.url !== call.url) {
    failures.push(`${label}: expected ${want.method} ${want.url}`)
  }
  if (want.body !== undefined) {
    failures.push(...subsetMismatches(call.body, want.body, `${label} body`))
  }
  for (const [name, value] of Object.entries(want.headers || {})) {
    if (request.headers.get(name) !== value) {
      failures.push(`${label} header ${name}: expected ${JSON.stringify(value)}, got ${JSON.stringify(request.headers.get(name))}`)
    }
  }
  return toResponse(exchange.response)
}))
server.listen({onUnhandledRequest: 'error'})
unblockClientsThatAwaitConnect()

let response
try {
  const handler = await loadHandler(entry, loadMode)
  response = handler.apiVersion === 1 ?
    await handler.fn(toLambdaEvent(scenario.request, await signatureHeaders(scenario)), lambdaContext(scenario)) :
    await fromWebResponse(await handler.fn(toWebRequest(scenario.request), {}))
} catch (err) {
  failures.push(`handler threw: ${err && err.stack ? err.stack : err}`)
}
server.close()

if (response) {
  failures.push(...responseMismatches(response, scenario.expect))
} else if (!failures.some((f) => f.startsWith('handler threw'))) {
  // Netlify turns a v1 handler resolving to nothing into an error, so a
  // missing response must fail rather than skip the response checks.
  failures.push(`handler returned no response (${JSON.stringify(response)})`)
}
for (const missed of exchanges.filter((candidate, i) => !used.has(i))) {
  failures.push(`outbound ${missed.request.method} ${missed.request.url}: expected but never made`)
}

process.stdout.write(`\n${RESULT_MARKER}${JSON.stringify({failures, response, calls})}\n`)
process.exit(0)


/**
 * Break a deadlock between msw and the Stripe SDK. Stripe's NodeHttpClient
 * holds the request (no `write`, no `end`, so not even the headers go out)
 * until the socket emits `connect` / `secureConnect`, unless
 * `socket.connecting` is already false. msw's mock socket (interceptors
 * 0.39) starts out `connecting` and emits those events only from
 * `mockConnect()`, which runs once a handler has responded — and no handler
 * runs before the request is sent. Each waits for the other and the process
 * exits with the request pending.
 *
 * So: on every outbound request, mark its socket connected as soon as it's
 * assigned. The listener is added inside `request()`, before the caller can
 * add its own, so Stripe's `socket` listener sees `connecting === false` and
 * sends at once. Nothing here is real network — every socket is msw's.
 * Patched on the CommonJS module objects, which is what a bundle's
 * `require('https')` and the Stripe SDK's `https_.default` both read.
 */
function unblockClientsThatAwaitConnect() {
  const require = createRequire(import.meta.url)
  for (const mod of [require('node:http'), require('node:https')]) {
    const request = mod.request
    mod.request = function requestWithConnectedSocket(...args) {
      const req = request.apply(this, args)
      req.once('socket', (socket) => {
        socket.connecting = false
      })
      return req
    }
  }
}


/**
 * @param {string} file
 * @param {'require'|'import'} mode
 * @return {Promise<object>} `{apiVersion: 1 or 2, fn}`
 */
async function loadHandler(file, mode) {
  let mod
  if (mode === 'import') {
    mod = await import(pathToFileURL(file).href)
  } else {
    try {
      mod = createRequire(file)(file)
    } catch (err) {
      if (err.code !== 'ERR_REQUIRE_ESM') {
        throw err
      }
      mod = await import(pathToFileURL(file).href)
    }
  }
  if (typeof mod.handler === 'function') {
    return {apiVersion: 1, fn: mod.handler}
  }
  if (typeof mod.default === 'function') {
    return {apiVersion: 2, fn: mod.default}
  }
  throw new Error(`${file} exports neither handler nor default`)
}


/**
 * `request.sign: "stripe"` signs the body with the scenario's
 * STRIPE_WEBHOOK_SECRET at replay time: Stripe signatures carry a timestamp
 * and `constructEvent` rejects one older than five minutes, so a recorded
 * header would go stale.
 *
 * @param {object} theScenario
 * @return {Promise<object>} headers to add
 */
async function signatureHeaders(theScenario) {
  if (theScenario.request.sign !== 'stripe') {
    return {}
  }
  const {default: Stripe} = await import('stripe')
  // eslint-disable-next-line new-cap -- `stripe` SDK ships as a factory function
  const signer = Stripe('sk_test_replay_signer')
  return {
    'stripe-signature': signer.webhooks.generateTestHeaderString({
      payload: bodyString(theScenario.request.body),
      secret: theScenario.env.STRIPE_WEBHOOK_SECRET,
    }),
  }
}


/**
 * Netlify's v1 event shape: lower-cased header names, the body as a string.
 *
 * @param {object} request scenario request
 * @param {object} extraHeaders
 * @return {object}
 */
function toLambdaEvent(request, extraHeaders) {
  const headers = Object.fromEntries(Object.entries({...request.headers, ...extraHeaders})
    .map(([name, value]) => [name.toLowerCase(), value]))
  const query = request.query || {}
  return {
    httpMethod: request.method,
    path: request.path,
    rawUrl: `https://replay.test${request.path}${queryString(query)}`,
    rawQuery: queryString(query).slice(1),
    headers,
    multiValueHeaders: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, [value]])),
    queryStringParameters: query,
    body: request.body === undefined ? null : bodyString(request.body),
    isBase64Encoded: false,
  }
}


/**
 * @param {object} theScenario
 * @return {object} enough of a Lambda context for Sentry's wrapHandler
 */
function lambdaContext(theScenario) {
  return {
    functionName: theScenario.request.path.split('/').pop(),
    awsRequestId: 'replay',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:replay',
    memoryLimitInMB: '1024',
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => LAMBDA_REMAINING_MS,
  }
}


/**
 * @param {object} request scenario request
 * @return {Request} for a v2 function
 */
function toWebRequest(request) {
  const hasBody = request.body !== undefined && !['GET', 'HEAD'].includes(request.method)
  return new Request(`https://replay.test${request.path}${queryString(request.query || {})}`, {
    method: request.method,
    headers: request.headers || {},
    body: hasBody ? bodyString(request.body) : undefined,
  })
}


/**
 * @param {Response} res
 * @return {Promise<{statusCode: number, headers: object, body: string}>}
 */
async function fromWebResponse(res) {
  return {statusCode: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text()}
}


/**
 * @param {object} spec scenario exchange response
 * @return {Response}
 */
function toResponse(spec) {
  if (spec.networkError) {
    return HttpResponse.error()
  }
  const headers = {...(spec.headers || {})}
  let body = spec.text
  if (spec.json !== undefined) {
    headers['content-type'] = headers['content-type'] || 'application/json'
    body = JSON.stringify(spec.json)
  }
  return new HttpResponse(body === undefined ? null : body, {status: spec.status, headers})
}


/**
 * An outbound request's body, decoded by its content type so a scenario can
 * match fields: JSON (axios), form-encoded (the Stripe SDK), else text.
 *
 * @param {Request} request
 * @return {Promise<*>}
 */
async function readBody(request) {
  const text = await request.text()
  if (!text) {
    return null
  }
  const type = request.headers.get('content-type') || ''
  if (type.includes('json')) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  if (type.includes('x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  return text
}


/**
 * @param {*} body
 * @return {string}
 */
function bodyString(body) {
  return typeof body === 'string' ? body : JSON.stringify(body)
}


/**
 * @param {object} query
 * @return {string} `?a=b…`, or '' for none
 */
function queryString(query) {
  const str = new URLSearchParams(query).toString()
  return str ? `?${str}` : ''
}
