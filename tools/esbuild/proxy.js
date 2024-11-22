import http from 'node:http'
import https from 'node:https'

/**
 * @param {string} proxiedHost The host to which traffic will be sent. E.g. localhost
 * @param {number} port The port to which traffic will be sent.  E.g. 8079
 * @param {boolean} useHttps Whether to use HTTPS for the proxied server
 * @return {object} Proxy server
 * @see https://esbuild.github.io/api/#serve-proxy
 */
export function createProxyServer(host, port, useHttps = false) {
  const requestModule = useHttps ? https : http

  return http.createServer((req, res) => {
    // Rewrite the URL if it matches the pattern for a .wasm file
    req.url = rewriteUrl(req.url)

    const options = {
      hostname: host,
      port: port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }

    // Forward each incoming request to the proxied server
    const proxyReq = requestModule.request(options, (proxyResponse) => {
      // If proxied server cannot find the resource, send a custom not-found page
      if (proxyResponse.statusCode === HTTP_NOT_FOUND) {
        serveNotFound(res)
        return
      }

      // Set the correct Content-Type for specific file types
      const contentType = getContentType(req.url)
      if (contentType) {
        res.setHeader('Content-Type', contentType)
      }

      // Optionally set Cache-Control headers for static assets
      if (isCacheable(req.url)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000')
      }

      // Forward the response from the proxied server to the client
      res.writeHead(proxyResponse.statusCode, proxyResponse.headers)
      proxyResponse.pipe(res, {end: true})
    })

    // Handle request errors
    proxyReq.on('error', (err) => {
      console.error(`Proxy request error: ${err.message}`)
      res.writeHead(HTTP_SERVER_ERROR)
      res.end('Internal Server Error')
    })

    // Forward the body of the request to the proxied server
    req.pipe(proxyReq, {end: true})
  })
}

const HTTP_FOUND = 200
const HTTP_NOT_FOUND = 404
const HTTP_SERVER_ERROR = 500

/** Serve a 200 bounce page for missing resources. */
const serveNotFound = (res) => {
  res.writeHead(HTTP_FOUND, {'Content-Type': 'text/html'})
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
    return '/static/js/ConwayGeomWasmWeb.wasm'
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
