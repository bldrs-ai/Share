import esbuild from 'esbuild'
import * as common from './common.js'


const SERVE_PORT = 8080

const ctx = await esbuild.context({
  ...common.build,
  banner: {
    js: `new EventSource('/esbuild').addEventListener('change', () => location.reload());`,
  },
})

await ctx.watch()

await ctx.serve({
  port: SERVE_PORT,
  servedir: 'docs/',
  fallback: 'docs/index.html',
})
