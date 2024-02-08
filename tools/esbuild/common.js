import copyStaticFiles from 'esbuild-copy-static-files'
import progress from 'esbuild-plugin-progress'
import svgrPlugin from 'esbuild-plugin-svgr'
import {fileURLToPath} from 'url'
import * as path from 'node:path'
import * as process from 'node:process'


const __filename = fileURLToPath(import.meta.url)
const __root = path.resolve(__filename, '../../../')
const entryPoint = path.resolve(__root, 'src', 'index.jsx')
const assetsDir = path.resolve(__root, 'public')
export const buildDir = path.resolve(__root, 'docs')


const webIfcShimAliasPlugin = {
  name: 'webIfcShimAlias',
  setup(build) {
    build.onResolve({filter: /^web-ifc$/}, (args) => {
      return {
        path: path.resolve(__root, 'node_modules/@bldrs-ai/conway/compiled/src/shim/ifc_api.js'),
      }
    })
  },
}


export const buildConfig = (useWebIfcShim) => {
  // Initialize plugins array
  const plugins = [
    progress(),
    svgrPlugin({plugins: ['@svgr/plugin-jsx'], dimensions: false}),
    copyStaticFiles({
      src: assetsDir,
      dest: buildDir,
    }),
  ]


  // Conditionally include webIfcShimAliasPlugin
  if (useWebIfcShim) {
    console.log('Using Conway shim backend')
    plugins.push(webIfcShimAliasPlugin)
  } else {
    console.log('Using original Web-Ifc backend')
  }

  const str = JSON.stringify

  // Return the build config
  return {
    entryPoints: [entryPoint],
    outdir: buildDir,
    format: 'esm',
    platform: 'browser',
    target: ['chrome64', 'firefox62', 'safari11.1', 'edge79', 'es2021'],
    bundle: true,
    minify: (process.env.MINIFY_BUILD || 'true') === 'true',
    keepNames: true, // TODOD(pablo): have had breakage without this
    splitting: false,
    metafile: true,
    sourcemap: true,
    logLevel: 'info',
    define: {
      'process.env.USE_WEBIFC_SHIM': str(useWebIfcShim),

      'process.env.DISABLE_MOCK_SERVICE_WORKER':
          str((process.env.NODE_ENV || 'development') === 'production'),

      // Auth
      'process.env.OAUTH2_CLIENT_ID': str(process.env.OAUTH2_CLIENT_ID || null),
      'process.env.OAUTH2_REDIRECT_URI': str(process.env.OAUTH2_REDIRECT_URI || null),
      'process.env.AUTH0_DOMAIN': str(process.env.AUTH0_DOMAIN || null),

      // GitHub
      'process.env.RAW_GIT_PROXY_URL':
          str(process.env.RAW_GIT_PROXY_URL || 'https://raw.githubusercontent.com'),
      'process.env.GITHUB_API_TOKEN': str(process.env.GITHUB_API_TOKEN || null),
      'process.env.GITHUB_BASE_URL':
          str(process.env.GITHUB_BASE_URL || 'https://api.github.com'),

      // Sentry
      'process.env.SENTRY_DSN': str(process.env.SENTRY_DSN || null),
      'process.env.SENTRY_ENVIRONMENT':
          str(process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || null),

    },
    plugins: plugins,
  }
}

const useShim = process.env.USE_WEBIFC_SHIM === 'true'
export const build = buildConfig(useShim)
