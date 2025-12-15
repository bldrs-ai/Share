import * as path from 'node:path'
import {fileURLToPath} from 'url'
import defines from './defines.js'
import makePlugins from './plugins.js'
import {log} from './utils.js'


const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const buildDir = path.resolve(repoRoot, 'docs')
const plugins = makePlugins(repoRoot, buildDir)

log('using defines\n', defines)

// The build config with two entry points:
// One for your main app (index.jsx) and one for your subscribe page.
export default {
  outdir: buildDir,
  // Optionally, use outbase to preserve your folder structure.
  outbase: path.resolve(repoRoot, 'src'),
  format: 'esm',
  platform: 'browser',
  // Roughly 2018-era browsers
  target: ['chrome64', 'firefox62', 'safari11.1', 'edge79', 'es2021'],
  bundle: true,
  loader: {
    '.css': 'css',
    '.woff': 'file',
    '.woff2': 'file',
    '.md': 'text',
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  minify: (process.env.MINIFY || 'true') === 'true',
  keepNames: true, // TODO: have had breakage without this
  splitting: false,
  metafile: true,
  sourcemap: true,
  logLevel: 'info',
  define: defines,
  plugins: plugins,
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
}
