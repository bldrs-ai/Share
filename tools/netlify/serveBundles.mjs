#!/usr/bin/env node
/*
 * Serve bundled Netlify Functions over HTTP, the way the platform fronts
 * them, so tools/netlify/smokeFunctions.mjs can be exercised end to end
 * without a deploy.
 *
 *   node tools/netlify/serveBundles.mjs <bundles.json> [port]
 *
 * `<bundles.json>` is the summary tools/netlify/bundleFunctions.mjs prints.
 * Prints `LISTENING <port>` once ready (port 0 picks a free one).
 *
 * Mirrors the parts of the platform a smoke probe can observe:
 *  - `/.netlify/functions/<name>` routes to that function's bundle, loaded
 *    on first request (a cold start) the way Lambda loads it — `require`,
 *    falling back to `import()` on ERR_REQUIRE_ESM, from the bundle's own
 *    directory, so a file missing from the zip fails here too;
 *  - a bundle that fails to load, or a handler that throws, answers 502 with
 *    a Lambda-style `{errorType, errorMessage}` body, which is what Netlify
 *    returns for ops#33's `Runtime.ImportModuleError`;
 *  - v1 handlers get a Lambda event (lower-cased headers, string body); v2
 *    handlers get a `Request` and return a `Response`.
 *
 * NOT a Netlify emulator: no redirects, no headers from netlify.toml, no
 * streaming, no timeout. Driven by tools/netlify/functionBundler.test.js.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'


const [summaryFile, portArg = '0'] = process.argv.slice(2)
if (!summaryFile) {
  console.error('usage: serveBundles.mjs <bundles.json> [port]')
  process.exit(2)
}
const bundles = new Map(JSON.parse(fs.readFileSync(summaryFile, 'utf8')).bundles.map((b) => [b.name, b]))
const loaded = new Map()
const LAMBDA_REMAINING_MS = 10000
const HTTP_NOT_FOUND = 404
const HTTP_BAD_GATEWAY = 502

// Same stub Netlify's v2 bootstrap expects from the Lambda runtime; see the
// loader in functionBundler.test.js.
globalThis.awslambda = {streamifyResponse: (fn) => fn, HttpResponseStream: {from: (s) => s}}


/**
 * @param {object} bundle
 * @return {Promise<object>} `{apiVersion: 1 or 2, fn}`
 */
async function loadFunction(bundle) {
  if (bundle.runtimeAPIVersion === 2) {
    const mod = await import(pathToFileURL(path.join(bundle.path, 'functions', `${bundle.name}.mjs`)).href)
    return {apiVersion: 2, fn: mod.default}
  }
  const entry = path.join(bundle.path, bundle.entryFilename)
  let mod
  try {
    mod = createRequire(entry)(entry)
  } catch (err) {
    if (err.code !== 'ERR_REQUIRE_ESM') {
      throw err
    }
    mod = await import(pathToFileURL(entry).href)
  }
  if (typeof mod.handler !== 'function') {
    throw new TypeError(`${bundle.name}: handler export is ${typeof mod.handler}`)
  }
  return {apiVersion: 1, fn: mod.handler}
}


/**
 * @param {http.ServerResponse} res
 * @param {string} errorType
 * @param {Error} err
 */
function platformError(res, errorType, err) {
  res.writeHead(HTTP_BAD_GATEWAY, {'content-type': 'application/json'})
  res.end(JSON.stringify({errorType, errorMessage: err.message}))
}


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const match = url.pathname.match(/^\/\.netlify\/functions\/([^/]+)$/)
  const bundle = match && bundles.get(match[1])
  if (!bundle) {
    res.writeHead(HTTP_NOT_FOUND, {'content-type': 'text/plain'})
    res.end('Function not found')
    return
  }
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const rawBody = Buffer.concat(chunks)

  let fn
  try {
    if (!loaded.has(bundle.name)) {
      loaded.set(bundle.name, loadFunction(bundle))
    }
    fn = await loaded.get(bundle.name)
  } catch (err) {
    loaded.delete(bundle.name)
    platformError(res, 'Runtime.ImportModuleError', err)
    return
  }

  try {
    if (fn.apiVersion === 2) {
      const response = await fn.fn(new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : rawBody,
      }), {})
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
      res.end(Buffer.from(await response.arrayBuffer()))
      return
    }
    const result = await fn.fn({
      httpMethod: req.method,
      path: url.pathname,
      rawUrl: url.href,
      rawQuery: url.search.slice(1),
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: rawBody.length ? rawBody.toString('utf8') : null,
      isBase64Encoded: false,
    }, {
      functionName: bundle.name,
      awsRequestId: 'serve-bundles',
      callbackWaitsForEmptyEventLoop: true,
      getRemainingTimeInMillis: () => LAMBDA_REMAINING_MS,
    })
    const body = result.isBase64Encoded ? Buffer.from(result.body || '', 'base64') : (result.body || '')
    res.writeHead(result.statusCode, result.headers || {})
    res.end(body)
  } catch (err) {
    platformError(res, err.name || 'Error', err)
  }
})

server.listen(Number(portArg), '127.0.0.1', () => {
  process.stdout.write(`LISTENING ${server.address().port}\n`)
})
