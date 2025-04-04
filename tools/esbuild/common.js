import * as path from 'node:path'
import * as process from 'node:process'
import {fileURLToPath} from 'url'
import defines from './defines.js'
import makePlugins from './plugins.js'
import {log} from './utils.js'


const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const indexFile = path.resolve(repoRoot, 'src', 'index.jsx')
const subscribeFile = path.resolve(repoRoot, 'src', 'subscribe', 'index.jsx')
const buildDir = path.resolve(repoRoot, 'docs')
const plugins = makePlugins(repoRoot, buildDir)

log('using config\n', defines)

// The build config with two entry points:
// One for your main app (index.jsx) and one for your subscribe page.
export default {
  // Add both entry points here. ESBuild will output a separate bundle for each.
  entryPoints: [indexFile, subscribeFile],
  outdir: buildDir,
  // Optionally, use outbase to preserve your folder structure.
  outbase: path.resolve(repoRoot, 'src'),
  format: 'esm',
  platform: 'browser',
  target: ['chrome64', 'firefox62', 'safari11.1', 'edge79', 'es2021'],
  bundle: true,
  external: ['*.woff', '*.woff2'],
  minify: (process.env.MINIFY || 'true') === 'true',
  keepNames: true, // TODO: have had breakage without this
  splitting: false,
  metafile: true,
  sourcemap: true,
  logLevel: 'info',
  define: defines,
  plugins: plugins,
  loader: {
    '.md': 'text',
  },
}
