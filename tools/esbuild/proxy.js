import http from 'http'


/**
 * @param {number} port The port for this proxy server to listen on.  E.g. 8080
 * @param {string} proxiedHost The host to which traffic will be sent. E.g. localhost
 * @param {number} port The port to which traffic will be sent.  E.g. 8079
 */
export function runProxyServer(port, proxiedHost, proxiedPort) {
  http.createServer((request, response) => {
    const options = {
      hostname: proxiedHost,
      port: proxiedPort,
      path: request.URL,
      method: request.method,
      headers: request.headers,
    }

    // Forward each incoming request to esbuild
    const proxyReq = proxyRequestHandler(options, response)

    // Forward the body of the request to esbuild
    request.pipe(proxyReq, {end: true})
  }).listen(port)
}


const HTTP_NOT_FOUND = 404


const proxyRequestHandler = (options, res) => {
  return http.request(options, (proxyResponse) => {
    // If esbuild returns "not found", send a custom 404 page
    if (proxyResponse.statusCode === HTTP_NOT_FOUND) {
      serveNotFound(res)
    } else {
      // Otherwise, forward the response from esbuild to the client
      res.writeHead(proxyResponse.statusCode, proxyResponse.headers)
      proxyResponse.pipe(res, {end: true})
    }
  })
}


const serveNotFound = ((res) => {
  res.writeHead(HTTP_NOT_FOUND, {'Content-Type': 'text/html\nServer: esbuild-proxy'})
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
