import copyStaticFiles from 'esbuild-copy-static-files'
import progress from 'esbuild-plugin-progress'
import svgrPlugin from 'esbuild-plugin-svgr'
import {fileURLToPath} from 'url'
import * as path from 'node:path'
import * as process from 'node:process'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const entryPoint = path.resolve(__dirname, '..', 'src', 'index.jsx')
const assetsDir = path.resolve(__dirname, '..', 'public')
export const buildDir = path.resolve(__dirname, '..', 'docs')

export const build = {
  entryPoints: [entryPoint],
  bundle: true,
  minify: process.env.MINIFY_BUILD === 'true',
  // https://esbuild.github.io/api/#keep-names
  // We use code identifiers e.g. in ItemProperties for their names
  keepNames: true,
  // Splitting
  // Entry points (our src/index.jsx) are currently not named with
  // cache-busting segments, like index-x84nfi.js, so we should be
  // careful with our caching, i.e. not putting much index.jsx.
  // See:
  //   https://esbuild.github.io/api/#chunk-names
  //   https://github.com/evanw/esbuild/issues/16
  splitting: false,
  metafile: true,
  outdir: buildDir,
  format: 'esm',
  sourcemap: true,
  platform: 'browser',
  target: ['chrome58', 'firefox57', 'safari11', 'edge18', 'es2020'],
  logLevel: 'info',
  define: {
    'process.env.OAUTH2_CLIENT_ID': JSON.stringify(process.env.OAUTH2_CLIENT_ID),
    'process.env.OAUTH2_REDIRECT_URI': JSON.stringify(process.env.OAUTH2_REDIRECT_URI || null),
    'process.env.AUTH0_DOMAIN': JSON.stringify(process.env.AUTH0_DOMAIN),
    'process.env.GITHUB_API_TOKEN': JSON.stringify(process.env.GITHUB_API_TOKEN),
    'process.env.GITHUB_BASE_URL': JSON.stringify(process.env.GITHUB_BASE_URL || 'https://api.github.com'),
    'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN || null),
    'process.env.SENTRY_ENVIRONMENT': JSON.stringify(process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV),
    'process.env.DISABLE_MOCK_SERVICE_WORKER': JSON.stringify(process.env.DISABLE_MOCK_SERVICE_WORKER),
  },
  plugins: [
    progress(),
    svgrPlugin(),
    copyStaticFiles({
      src: assetsDir,
      dest: buildDir,
    }),
  ],
}
