import http from 'node:http'
import https from 'node:https'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'
import {loadSpaAllowlist, isSpaPath} from '../netlify/redirects.js'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const MARKETING_OUT = path.join(REPO_ROOT, 'marketing', 'out')

// SPA fallback allowlist sourced from public/_redirects so dev mirrors what
// Netlify enforces in prod. Loaded once at module init.
const spaAllowlist = loadSpaAllowlist()

// Marketing static export (Next.js `output: 'export'`) overlays onto docs/
// at deploy time. In dev we read it from disk so file-match wins over the
// SPA fallback, matching Netlify's resolution order. Without it, /about,
// /pricing, /blog etc. would fall through to the old SPA pages.
const marketingOutAvailable = fs.existsSync(MARKETING_OUT)
if (!marketingOutAvailable) {
  console.warn(
    'proxy: marketing/out not found — /about, /pricing, /blog, etc. will\n' +
    '       fall through to the SPA. Run `cd marketing && yarn build` to\n' +
    '       enable the static marketing overlay.')
}


/**
 * @param {string} host The host to which traffic will be sent. E.g. localhost
 * @param {number} port The port to which traffic will be sent.  E.g. 8079
 * @param {boolean} useHttps Whether to use HTTPS for the proxied server
 * @return {object} Proxy server
 * @see https://esbuild.github.io/api/#serve-proxy
 */
export function createProxyServer(host, port, useHttps = false) {
  const requestModule = http

  const serverOptions = useHttps ?
    {
      key: fs.readFileSync(path.join(__dirname, './certificate/localhost-key.pem')),
      cert: fs.readFileSync(path.join(__dirname, './certificate/localhost.pem')),
    } :
    {}

  const server = useHttps ?
    https.createServer(serverOptions, handleRequest) :
    http.createServer(handleRequest)

  /**
   * @param {object} req - Request object
   * @param {object} res - Response object
   */
  function handleRequest(req, res) {
    req.url = rewriteUrl(req.url)

    // File-match wins (mirrors Netlify): if marketing/out has a static page
    // for this path, serve it before forwarding to esbuild.
    if (marketingOutAvailable && tryServeMarketing(req.url, res)) {
      return
    }

    const options = {
      hostname: host,
      port: port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }

    const proxyReq = requestModule.request(options, (proxyResponse) => {
      if (proxyResponse.statusCode === HTTP_NOT_FOUND) {
        if (isSpaPath(req.url, spaAllowlist)) {
          serveSpaBounce(res)
        } else {
          serveNotFound(res)
        }
        return
      }

      // Don't modify headers for /esbuild (EventSource hot reload) or /subscribe
      const isPassthroughPath = req.url.startsWith('/esbuild') || req.url.startsWith('/subscribe')

      if (!isPassthroughPath) {
        const contentType = getContentType(req.url)
        if (contentType) {
          res.setHeader('Content-Type', contentType)
        }

        if (isCacheable(req.url)) {
          const cacheHeader = process.env.ESBUILD_WATCH === 'true' ?
            'no-store' :
            'public, max-age=31536000'
          res.setHeader('Cache-Control', cacheHeader)
        }
      }

      // If the request is for /subscribe or /esbuild, do not add COOP/COEP headers.
      // Otherwise, add the headers needed for cross-origin isolation.
      let headersToSend = {}
      if (isPassthroughPath) {
        headersToSend = {
          ...proxyResponse.headers,
        }
      } else {
        headersToSend = {
          ...proxyResponse.headers,
          // same-origin-allow-popups lets GIS deliver OAuth tokens via postMessage
          // without nulling window.opener in the cross-origin popup.
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
          // COEP intentionally omitted: docs.google.com/picker sends CORP: same-site,
          // which Chrome enforces under any COEP value (require-corp or credentialless),
          // blocking the Picker iframe. Without COOP: same-origin, crossOriginIsolated
          // is already false here regardless, so omitting COEP costs nothing on this
          // dev server. Production fix: load Picker in a popup window (TODO).
        }
      }

      res.writeHead(proxyResponse.statusCode, headersToSend)
      proxyResponse.pipe(res, {end: true})
    })

    proxyReq.on('error', (err) => {
      console.error(`Proxy request error: ${err.message}`)
      res.writeHead(HTTP_SERVER_ERROR)
      res.end('Internal Server Error')
    })

    req.pipe(proxyReq, {end: true})
  }


  return server
}

const HTTP_OK = 200
const HTTP_MOVED_PERMANENTLY = 301
const HTTP_NOT_FOUND = 404
const HTTP_SERVER_ERROR = 500


/**
 * Serve a marketing static file if one exists for the request path. Mirrors
 * Netlify's resolution order (file match > _redirects) so /about/, /blog/,
 * /sitemap.xml etc. render their pre-rendered HTML instead of falling
 * through to the SPA.
 *
 * @param {string} reqUrl Request URL (may include query/hash).
 * @param {object} res Response object.
 * @return {boolean} True if a marketing file was served.
 */
function tryServeMarketing(reqUrl, res) {
  const reqPath = reqUrl.split('?')[0].split('#')[0]

  // Trailing-slash directory case: /about/ → marketing/out/about/index.html
  if (reqPath.endsWith('/')) {
    const indexHtml = safeJoin(MARKETING_OUT, `${reqPath}index.html`)
    if (indexHtml && fs.existsSync(indexHtml)) {
      return serveStatic(indexHtml, 'text/html; charset=UTF-8', res)
    }
    return false
  }

  // Bare path that maps to a marketing directory → 301 to slashed form.
  // Mirrors Netlify Pretty URLs (which 301 /about → /about/ when /about/
  // is a directory with index.html).
  const dirIndex = safeJoin(MARKETING_OUT, `${reqPath}/index.html`)
  if (dirIndex && fs.existsSync(dirIndex)) {
    res.writeHead(HTTP_MOVED_PERMANENTLY, {Location: `${reqPath}/`})
    res.end()
    return true
  }

  // Direct asset (e.g. /sitemap.xml, /og-default.png).
  const asset = safeJoin(MARKETING_OUT, reqPath)
  if (asset && fs.existsSync(asset) && fs.statSync(asset).isFile()) {
    return serveStatic(asset, marketingContentType(reqPath), res)
  }
  return false
}


/**
 * Resolve a child path under root, returning null if it escapes root
 * (defense-in-depth against path traversal in the dev proxy).
 *
 * @param {string} root Absolute root directory.
 * @param {string} child Untrusted child path.
 * @return {string|null} Resolved absolute path, or null if outside root.
 */
function safeJoin(root, child) {
  const resolved = path.resolve(root, `.${child}`)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null
  }
  return resolved
}


/**
 * Stream a file from disk with the given content type.
 *
 * @param {string} filePath Absolute path to the file.
 * @param {string} contentType MIME type to send.
 * @param {object} res Response object.
 * @return {boolean} True on success.
 */
function serveStatic(filePath, contentType, res) {
  const body = fs.readFileSync(filePath)
  res.writeHead(HTTP_OK, {
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  })
  res.end(body)
  return true
}


/**
 * Content-Type for marketing static assets. Broader than getContentType()
 * since the marketing build emits xml/txt/image files too.
 *
 * @param {string} p Request path.
 * @return {string} MIME type.
 */
function marketingContentType(p) {
  if (p.endsWith('.html')) {
    return 'text/html; charset=UTF-8'
  } else if (p.endsWith('.xml')) {
    return 'application/xml'
  } else if (p.endsWith('.txt')) {
    return 'text/plain; charset=UTF-8'
  } else if (p.endsWith('.png')) {
    return 'image/png'
  } else if (p.endsWith('.jpg') || p.endsWith('.jpeg')) {
    return 'image/jpeg'
  } else if (p.endsWith('.svg')) {
    return 'image/svg+xml'
  } else if (p.endsWith('.json')) {
    return 'application/json'
  } else if (p.endsWith('.css')) {
    return 'text/css'
  } else if (p.endsWith('.js')) {
    return 'application/javascript'
  }
  return 'application/octet-stream'
}


/**
 * Serve the gh-pages SPA-routing bounce page. Returns 200 with HTML that
 * uses window.location.replace to encode the original path into the query
 * string of /, where the SPA's index.html decoder restores it via
 * history.replaceState. Used as the SPA fallback for paths in the
 * _redirects allowlist (e.g. /share/*, /ipsum, /popup-auth).
 *
 * @param {object} res Response object.
 */
const serveSpaBounce = (res) => {
  res.writeHead(HTTP_OK, {
    'Content-Type': 'text/html',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  })
  res.end(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>BLDRS - Redirect</title>
    <script type="text/javascript">
      var pathSegmentsToKeep = window.location.pathname.startsWith('/Share') ? 1 : 0
      var l = window.location
      var u1 = l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '')
      var u2 = l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/'
      var u3 = l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~')
      var u4 = (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '')
      l.replace(u1 + u2 + u3 + u4 + l.hash)
    </script>
  </head>
  <body>
    Resource not found. Redirecting...
  </body>
</html>`)
}


/**
 * Serve a real 404 — used for unknown paths that match neither a marketing
 * file nor the SPA allowlist. Mirrors Netlify's default 404 behavior in
 * prod so the dev server doesn't paper over soft-404 SEO issues.
 *
 * @param {object} res Response object.
 */
const serveNotFound = (res) => {
  res.writeHead(HTTP_NOT_FOUND, {'Content-Type': 'text/plain; charset=UTF-8'})
  res.end('Not Found\n')
}

/**
 * Rewrite the URL if it's a .wasm file.
 *
 * @param {string} url The original request URL
 * @return {string} The rewritten URL
 */
function rewriteUrl(url) {
  // Regular expression to match any URL that ends with .wasm
  const regex = /^.*\.wasm$/

  // If the URL matches the regex, rewrite it
  if (regex.test(url)) {
    return '/static/js/ConwayGeomWasmWebMT.wasm'
  }

  // Regular expression to match any URL containing ConwayGeomWasmWeb.js
  const regex2 = /ConwayGeomWasmWebMT\.js$/

  if (regex2.test(url)) {
    return '/static/js/ConwayGeomWasmWebMT.js'
  }

  return url
}


/**
 * Get the Content-Type based on file extension.
 *
 * @param {string} url The request URL
 * @return {string|null} The MIME type or null if not recognized
 */
function getContentType(url) {
  if (url.endsWith('.js')) {
    return 'application/javascript'
  } else if (url.endsWith('.wasm')) {
    return 'application/wasm'
  } else if (url.endsWith('.json')) {
    return 'application/json'
  } else if (url.endsWith('.css')) {
    return 'text/css'
  } else if (url.endsWith('.html')) {
    return 'text/html'
  }
  return null
}

/**
 * Determine if a resource is cacheable.
 *
 * @param {string} url The request URL
 * @return {boolean} True if the resource should be cached
 */
function isCacheable(url) {
  return /\.(js|css|wasm|png|jpg|jpeg|gif|svg|ico)$/.test(url)
}
