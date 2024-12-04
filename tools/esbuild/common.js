import * as path from 'node:path'
import * as process from 'node:process'
import {fileURLToPath} from 'url'
import defines from './defines.js'
import makePlugins from './plugins.js'
import {log} from './utils.js'


const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const indexFile = path.resolve(repoRoot, 'src', 'index.jsx')
const buildDir = path.resolve(repoRoot, 'docs')
const plugins = makePlugins(repoRoot, buildDir)

log('using config\n', defines)

// The build config
export default {
  entryPoints: [indexFile],
  outdir: buildDir,
  format: 'esm',
  platform: 'browser',
  target: ['chrome64', 'firefox62', 'safari11.1', 'edge79', 'es2021'],
  bundle: true,
  external: ['*.woff', '*.woff2'],
  minify: (process.env.MINIFY || 'true') === 'true',
  keepNames: true, // TODO(pablo): have had breakage without this
  splitting: false,
  metafile: true,
  sourcemap: true,
  logLevel: 'info',
  define: defines,
  plugins: plugins,
}
