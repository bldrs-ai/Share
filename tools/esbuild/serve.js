import esbuild from 'esbuild'
import config from './common.js'
import {createProxyServer} from './proxy.js'
import {log} from './utils.js'
import defines from './defines.js'


const ctx = await esbuild.context(config)

if (defines['process.env.ESBUILD_WATCH'] === 'true') {
  await ctx.watch()
} else {
  console.warn('Esbuild hot reload DISABLED', process.env.ESBUILD_WATCH)
}

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
const SERVE_PORT = 8080
const {host, port} = await ctx.serve({
  port: SERVE_PORT - 1,
  servedir: config.outdir,
})
log(`Esbuild's backend server 👆\n`)
createProxyServer(host, port, (process.env.serveHttps === 'true')).listen(SERVE_PORT)

// Make sure to add a newline as the subsequent watch mode will otherwise
// overwrite the current line
if (process.env.serveHttps === 'true') {
  log(`Share frontend server 👉 https://localhost:${SERVE_PORT} and watching...\n`)
} else {
  log(`Share frontend server 👉 http://localhost:${SERVE_PORT} and watching...\n`)
}
