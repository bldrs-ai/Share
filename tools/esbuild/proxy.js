import http from 'node:http'

/**
 * @param {string} proxiedHost The host to which traffic will be sent. E.g. localhost
 * @param {number} port The port to which traffic will be sent.  E.g. 8079
 * @return {object} Proxy server
 * @see https://esbuild.github.io/api/#serve-proxy
 */
export function createProxyServer(host, port) {
  return http.createServer((req, res) => {
    const options = {
      hostname: host,
      port: port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }

    // Forward each incoming request to esbuild
    const proxyReq = http.request(options, (proxyResponse) => {
      // If esbuild cannot find the resource to serve, send our react-router bounce.
      if (proxyResponse.statusCode === HTTP_NOT_FOUND) {
        serveNotFound(res)
        return
      }

      // Set the correct Content-Type for .js files
      if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript')
      }

      // Otherwise, forward the response from esbuild to the client
      res.writeHead(proxyResponse.statusCode, proxyResponse.headers)
      proxyResponse.pipe(res, {end: true})
    })

    // Forward the body of the request to esbuild
    req.pipe(proxyReq, {end: true})
  })
}

const HTTP_FOUND = 200
const HTTP_NOT_FOUND = 404

/** Serve a 200 bounce page for missing resources. */
const serveNotFound = ((res) => {
  res.writeHead(HTTP_FOUND, {'Content-Type': 'text/html'})
  res.end(`<!DOCTYPE html>
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
