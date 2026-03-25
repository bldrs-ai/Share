import http from 'node:http'
import https from 'node:https'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

/**
 * @param {string} host The host to which traffic will be sent. E.g. localhost
 * @param {number} port The port to which traffic will be sent.  E.g. 8079
 * @param {boolean} useHttps Whether to use HTTPS for the proxied server
 * @return {object} Proxy server
 * @see https://esbuild.github.io/api/#serve-proxy
 */
export function createProxyServer(host, port, useHttps = false) {
  const requestModule = http
  // Derive __dirname equivalent in ES Modules
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

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
    // Serve testdata files directly from disk
    if (req.url.startsWith('/testdata/')) {
      const filePath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../'), req.url)
      try {
        const data = fs.readFileSync(filePath)
        const ct = getContentType(req.url) || 'application/octet-stream'
        res.writeHead(200, {
          'Content-Type': ct,
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
      return
    }

    req.url = rewriteUrl(req.url)

    const options = {
      hostname: host,
      port: port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }

    const proxyReq = requestModule.request(options, (proxyResponse) => {
      if (proxyResponse.statusCode === HTTP_NOT_FOUND) {
        serveNotFound(res)
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
          res.setHeader('Cache-Control', 'public, max-age=31536000')
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
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
          'Cross-Origin-Embedder-Policy': 'credentialless',
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

const HTTP_FOUND = 200
const HTTP_NOT_FOUND = 404
const HTTP_SERVER_ERROR = 500

/**
 * Serve a 200 bounce page for missing resources.
 *
 * @param {object} res - Response object
 */
const serveNotFound = (res) => {
  res.writeHead(HTTP_FOUND, {
    'Content-Type': 'text/html',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Embedder-Policy': 'credentialless',
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
