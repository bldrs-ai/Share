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
  // The @bldrs-ai/conway wasm glue (Emscripten 6.0.2) emits BigInt literals
  // (e.g. `0n`) for its 64-bit interop. esbuild cannot down-level BigInt
  // syntax — there is no polyfill — so with the 2018 target it errors out.
  // Allow BigInt through: the conway 3D engine already requires a modern,
  // cross-origin-isolated browser (SharedArrayBuffer + threads) well beyond
  // any pre-BigInt browser, so this narrows nothing that could run it anyway.
  // `dynamic-import`: the target list above includes firefox62, which
  // predates dynamic import, so esbuild lowers every `import(expr)` it
  // cannot resolve statically into `Promise.resolve().then(() =>
  // __require(expr))` — and that shim THROWS at runtime ("Dynamic require
  // ... is not supported"). The pro-module loader
  // (`src/export/importModuleFromUrl.js`) imports a runtime-built `blob:`
  // URL, which is un-analyzable by construction, so it needs the real
  // syntax preserved. Same reasoning as bigint above: every browser that
  // can run this app (SharedArrayBuffer + OPFS + wasm threads) has
  // supported dynamic import for years, so declaring it narrows nothing
  // that could run today. Literal `import('pkg')` calls are unaffected —
  // the bundler still inlines those into this bundle.
  supported: {'bigint': true, 'dynamic-import': true},
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
