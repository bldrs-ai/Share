import esbuild from 'esbuild'
import * as common from './common.js'


const SERVE_PORT = 8080

// Read the environment variable
const useWebIfcShim = process.env.USE_WEBIFC_SHIM === 'true';

const ctx = await esbuild.context({
  ...common.buildConfig(useWebIfcShim),
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
