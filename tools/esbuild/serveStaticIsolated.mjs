/**
 * Minimal static file server that serves a build directory with the
 * HTTP headers required for cross-origin isolation
 * (`crossOriginIsolated === true`). Used only by the web-ifc-engine
 * Playwright variant (`tools/playwright.webifc.config.js`).
 *
 * Why a separate server: web-ifc's glue selects its multi-threaded
 * wasm — which needs a `SharedArrayBuffer` — only when the page is
 * cross-origin isolated (web-ifc-api.js: `if (self.crossOriginIsolated)
 * WebIFCWasm = require_web_ifc_mt()`). The default Conway test serve
 * (`http-server`, via `test-flows-serve`) and the prod/dev servers
 * deliberately do NOT isolate, because COEP breaks the Google Drive
 * Picker (docs.google.com/picker sends `CORP: same-site`). Isolation is
 * therefore scoped to this comparison build rather than enabled
 * globally.
 *
 * Usage: `node tools/esbuild/serveStaticIsolated.mjs <dir> <port>`
 *
 * Not general-purpose: GET/HEAD only, no range requests (web-ifc fetches
 * the wasm whole), and unknown paths fall back to the SPA `404.html`
 * bounce — mirroring how `http-server` serves this build so client
 * routes like `/share/v/p/index.ifc` boot the app.
 */
import {createServer} from 'node:http'
import {createReadStream, promises as fs} from 'node:fs'
import {extname, join, normalize, resolve} from 'node:path'


const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const DEFAULT_PORT = 8080

const servedDir = resolve(process.argv[2] || 'docs')
const port = Number(process.argv[3] || DEFAULT_PORT)

// `instantiateStreaming` requires exactly `application/wasm`; the other
// types keep the browser from refusing modules/styles on a wrong MIME.
const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ifc': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}
const DEFAULT_MIME = 'application/octet-stream'


/**
 * The headers that, together, make the browser report
 * `crossOriginIsolated === true`. CORP `cross-origin` is added on every
 * response so the page's own same-origin subresources aren't blocked by
 * its own COEP.
 *
 * @return {object} header map applied to every response
 */
function isolationHeaders() {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store',
  }
}


/**
 * Resolve a URL path to a file inside the served dir, guarding against
 * `..` traversal.
 *
 * @param {string} urlPath decoded pathname from the request
 * @return {string|null} absolute filesystem path, or null if it escapes root
 */
function safePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '')
  const abs = join(servedDir, clean)
  return abs.startsWith(servedDir) ? abs : null
}


/**
 * Serve the SPA `404.html` bounce (the spa-github-pages redirect) so an
 * unknown client route boots the app instead of dead-ending.
 *
 * @param {object} res Node http ServerResponse
 * @return {Promise<void>}
 */
async function serveSpaFallback(res) {
  try {
    const body = await fs.readFile(join(servedDir, '404.html'))
    res.writeHead(HTTP_NOT_FOUND, {...isolationHeaders(), 'Content-Type': MIME_BY_EXT['.html']})
    res.end(body)
  } catch {
    res.writeHead(HTTP_NOT_FOUND, isolationHeaders())
    res.end('Not found')
  }
}


/**
 * Send a file with isolation headers, falling back to the SPA bounce
 * when the path is not a real file.
 *
 * @param {object} res Node http ServerResponse
 * @param {string} abs absolute file path to try
 * @return {Promise<void>}
 */
async function sendFile(res, abs) {
  let stat
  try {
    stat = await fs.stat(abs)
  } catch {
    return serveSpaFallback(res)
  }
  if (stat.isDirectory()) {
    return sendFile(res, join(abs, 'index.html'))
  }
  const type = MIME_BY_EXT[extname(abs).toLowerCase()] || DEFAULT_MIME
  res.writeHead(HTTP_OK, {...isolationHeaders(), 'Content-Type': type})
  createReadStream(abs).pipe(res)
}


const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(HTTP_METHOD_NOT_ALLOWED, isolationHeaders())
    res.end()
    return
  }
  const urlPath = (req.url || '/').split('?')[0]
  const abs = safePath(urlPath === '/' ? '/index.html' : urlPath)
  if (abs === null) {
    res.writeHead(HTTP_NOT_FOUND, isolationHeaders())
    res.end('Bad path')
    return
  }
  sendFile(res, abs)
})

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`isolated static server: ${servedDir} on http://localhost:${port} (cross-origin isolated)`)
})
