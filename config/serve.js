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
        res.end('<html><head><meta http-equiv="refresh" content="0; URL=/"></head>');
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
