import esbuild from 'esbuild'
import http from 'http'
import * as common from './common.js'

const port = 8080;

esbuild.serve({
  port: port,
  servedir: common.build.outdir
}, common.build).then(result => {
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
    const proxyReq = http.request(options, proxyRes => {
      // If esbuild returns "not found", send a custom 404 page
      if (proxyRes.statusCode === 404) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
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
      var pathSegmentsToKeep = window.location.pathname.startsWith('/Share') ? 1 : 0;

      var l = window.location;
      var u1 = l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '');
      var u2 = l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/';
      var u3 = l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~');
      var u4 = (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '');
      //console.log('Redirect URL parts: ', u1, u2, u3, u4);
      l.replace(u1 + u2 + u3 + u4 + l.hash);
    </script>
  </head>
  <body>
    Resource not found.  Redirecting...
  </body>
</html>`);
        return;
      }

      // Otherwise, forward the response from esbuild to the client
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    // Forward the body of the request to esbuild
    req.pipe(proxyReq, { end: true });
  }).listen(port);
  console.log(`serving on http://localhost:${port} and watching...`)
}).catch((error) => {
  console.error(`could not start serving: `, error);
  process.exit(1)
})
