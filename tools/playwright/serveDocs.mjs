/**
 * Zero-dependency static server for Playwright shards that skip
 * `yarn install`. Mirrors `npx http-server docs -c-1`: GET/HEAD, no
 * cache, unknown paths serve `docs/404.html` (the spa-github-pages
 * bounce) so `/share/v/p/index.ifc` still boots the SPA.
 *
 * Usage: `node tools/playwright/serveDocs.mjs <dir> <port>`
 *
 * Not the isolated server. web-ifc's COOP/COEP serve stays in
 * `tools/esbuild/serveStaticIsolated.mjs` — COEP breaks the Drive picker.
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

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
const NO_CACHE = {'Cache-Control': 'no-store'}


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
 * Serve the SPA `404.html` bounce so an unknown client route boots the app.
 *
 * @param {object} res Node http ServerResponse
 * @return {Promise<void>}
 */
async function serveSpaFallback(res) {
  try {
    const body = await fs.readFile(join(servedDir, '404.html'))
    res.writeHead(HTTP_NOT_FOUND, {...NO_CACHE, 'Content-Type': MIME_BY_EXT['.html']})
    res.end(body)
  } catch {
    res.writeHead(HTTP_NOT_FOUND, NO_CACHE)
    res.end('Not found')
  }
}


/**
 * Send a file, falling back to the SPA bounce when the path is not a
 * real file.
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
  res.writeHead(HTTP_OK, {...NO_CACHE, 'Content-Type': type})
  createReadStream(abs).pipe(res)
}


const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(HTTP_METHOD_NOT_ALLOWED, NO_CACHE)
    res.end()
    return
  }
  const urlPath = (req.url || '/').split('?')[0]
  const abs = safePath(urlPath === '/' ? '/index.html' : urlPath)
  if (abs === null) {
    res.writeHead(HTTP_NOT_FOUND, NO_CACHE)
    res.end('Bad path')
    return
  }
  sendFile(res, abs)
})

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`playwright static server: ${servedDir} on http://localhost:${port}`)
})
