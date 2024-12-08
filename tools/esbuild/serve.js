import esbuild from 'esbuild'
import config from './common.js'
import {createProxyServer} from './proxy.js'
import {log} from './utils.js'


const ctx = await esbuild.context(config)

// Watch rebuilds docs/ which can interfere with cypress
if (process.env.ESBUILD_WATCH === 'true') {
  await ctx.watch()
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
createProxyServer(host, port).listen(SERVE_PORT)

// Make sure to add a newline as the subsequent watch mode will otherwise
// overewrite the current line
log(`Share frontend server 👉 http://localhost:${SERVE_PORT} and watching...\n`)
