import esbuild from 'esbuild'
import http from 'http'
import * as common from './common.js'


const SERVE_PORT = 8080
const HTTP_NOT_FOUND = 404

const serveNotFound = ((res) => {
  res.writeHead(HTTP_NOT_FOUND, {'Content-Type': 'text/html'})
  res.end(
      `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>BLDRS - Redirect</title>
    <script type="text/javascript">
      // Single Page Apps for GitHub Pages
      // MIT License
      // https://github.com/rafgraph/spa-github-pages
      // This page needs to be > 512 bytes to work for IE.  Currently 968.
      var pathSegmentsToKeep = window.location.pathname.startsWith('/Share') ? 1 : 0

      var l = window.location
      var u1 = l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '')
      var u2 = l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/'
      var u3 = l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~')
      var u4 = (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '')
      //console.log('Redirect URL parts: ', u1, u2, u3, u4)
      l.replace(u1 + u2 + u3 + u4 + l.hash)
    </script>
  </head>
  <body>
    Resource not found.  Redirecting...
  </body>
</html>`)
})

const proxyRequestHandler = ((options, res) => http.request(options, (proxyRes) => {
  // If esbuild returns "not found", send a custom 404 page
  if (proxyRes.statusCode === HTTP_NOT_FOUND) {
    serveNotFound(res)
  }

  // Otherwise, forward the response from esbuild to the client
  res.writeHead(proxyRes.statusCode, proxyRes.headers)
  proxyRes.pipe(res, {end: true})
})
)


/**
 * "It's not possible to hook into esbuild's local server to customize
 * the behavior of the server itself. Instead, behavior should be
 * customized by putting a proxy in front of esbuild."
 *
 * We intend to serve on the SERVE_PORT defined above, so run esbuild
 * on the port below it, and use the SERVE_PORT for a proxy.  The
 * proxy handles 404s with the bounce script above.
 *
 * See https://esbuild.github.io/api/#customizing-server-behavior
 */
esbuild.serve({
  port: SERVE_PORT - 1,
  servedir: common.build.outdir,
}, common.build).then((result) => {
  // The result tells us where esbuild's local server is
  const {host, port} = result

  http.createServer((req, res) => {
    const options = {
      hostname: host,
      port: port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }

    // Forward each incoming request to esbuild
    const proxyReq = proxyRequestHandler(options, res)

    // Forward the body of the request to esbuild
    req.pipe(proxyReq, {end: true})
  }).listen(SERVE_PORT)
  console.log(`serving on http://localhost:${SERVE_PORT} and watching...`)
}).catch((error) => {
  console.error(`could not start serving: `, error)
  process.exit(1)
})
