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
  // keepNames preserves function/class names through minification by
  // wrapping every function expression in a `__name(fn, "name")` helper
  // call. That breaks three.js's `DRACOLoader._initDecoder`, which uses
  // `Function.prototype.toString()` to copy a function body into a
  // worker — the minified body references the `__name` helper by its
  // bundle-local mangled identifier (e.g. `s`) that isn't defined in the
  // worker scope, causing every worker to throw `ReferenceError: s is
  // not defined` and DRACO decode to fail silently on cache-hit loads.
  // Disabled because no current code relies on `.name` for runtime
  // behavior; the TODO that flagged "have had breakage without this"
  // predates the r184 upgrade and may no longer apply. Sourcemaps still
  // give debuggers readable names.
  keepNames: false,
  splitting: false,
  metafile: true,
  sourcemap: true,
  logLevel: 'info',
  define: defines,
  plugins: plugins,
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
}
