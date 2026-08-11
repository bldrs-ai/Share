import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import copyStaticFiles from 'esbuild-copy-static-files'
import progress from 'esbuild-plugin-progress'
import svgrPlugin from 'esbuild-plugin-svgr'
import {isWebIfcShimEnabled} from './defines.js'
import {log} from './utils.js'


/**
 * @param {string} root - Root directory
 * @param {string} buildDir - Build directory
 * @return {object}
 */
export default function makePlugins(root, buildDir) {
  const assetsDir = path.resolve(root, 'public')

  const webIfcShimAliasPlugin = {
    name: 'webIfcShimAlias',
    setup(build) {
      build.onResolve({filter: /^web-ifc$/}, (args) => {
        return {
          // Conway now ships the web-ifc compat surface itself, via the
          // `@bldrs-ai/conway/web-ifc` subpath export (the standalone
          // `@bldrs-ai/conway-web-ifc-adapter` package is retired). Resolve
          // to its compiled entry directly so Share depends on Conway alone.
          path: path.resolve(root, 'node_modules/@bldrs-ai/conway/compiled/src/compat/web-ifc/index.js'),
        }
      })
    },
  }

  // Pin the real-web-ifc build to web-ifc's single-threaded engine.
  //
  // web-ifc 0.0.35 chooses between its MT and ST wasm at module-load time
  // on `self.crossOriginIsolated`. We serve the app cross-origin-isolated
  // (Conway's MT wasm needs it), so that check is true and web-ifc selects
  // its MT build — which then can't run: the npm package ships neither
  // `web-ifc-mt.worker.js` nor a standalone `web-ifc-mt.js` for that worker
  // to import. CI confirmed the chain end-to-end (worker 404 -> wasm
  // abort). Until the MT follow-up (a web-ifc that bundles a worker, or a
  // vendored one — see design/new/viewer-replacement.md §5f), force the ST
  // engine: it ships `web-ifc.wasm` and needs no worker.
  //
  // Two surgical rewrites of the resolved `web-ifc-api.js`:
  //   1. force the engine selector to its ST branch.
  //   2. resolve `*.wasm` from the absolute `/static/js/` (where
  //      `build-share-copy-wasm-webifc` puts it). web-ifc otherwise
  //      resolves it relative to the page's `scriptDirectory` — the deep
  //      model route `/share/v/p/…`, not the server root — so a relative
  //      path 404s regardless of `SetWasmPath`.
  // Each rewrite is asserted to hit exactly once, so a future web-ifc bump
  // fails the build loudly instead of silently regressing to broken MT.
  // Conway's adapter has the identical selector + locateFile shape, so this
  // is scoped to the real-web-ifc build only (not registered under shim).
  const webIfcSingleThreadRewrites = [
    {
      from: 'if (typeof self !== "undefined" && self.crossOriginIsolated) {',
      to: 'if (false) {',
    },
    {
      from: 'return prefix + this.wasmPath + path;',
      to: 'return \'/static/js/\' + path;',
    },
  ]
  const webIfcSingleThreadPlugin = {
    name: 'webIfcSingleThread',
    setup(build) {
      build.onLoad({filter: /web-ifc[\\/]web-ifc-api\.js$/}, async (args) => {
        let contents = await fs.readFile(args.path, 'utf8')
        for (const {from, to} of webIfcSingleThreadRewrites) {
          const occurrences = contents.split(from).length - 1
          if (occurrences !== 1) {
            throw new Error(
              `webIfcSingleThread: expected exactly 1 occurrence of ${JSON.stringify(from)} ` +
              `in ${args.path}, found ${occurrences}. web-ifc changed — re-verify the ST pin.`)
          }
          contents = contents.replace(from, to)
        }
        return {contents, loader: 'js', resolveDir: path.dirname(args.path)}
      })
    },
  }

  const fontDisplayPlugin = {
    name: 'fontDisplay',
    setup(build) {
      build.onLoad({filter: /\.css$/, namespace: 'file'}, async (args) => {
        if (!args.path.includes('@fontsource')) {
          return
        }
        const contents = await fs.readFile(args.path, 'utf8')
        return {
          contents: contents.replace(/font-display:\s*swap/g, 'font-display: optional'),
          loader: 'css',
          resolveDir: path.dirname(args.path),
        }
      })
    },
  }


  // `three/examples/jsm/*` imports without a `.js` extension stop resolving
  // under modern three's `package.json#exports` (the map is literal — no
  // automatic extension fallback). This onResolve hook appends `.js`.
  //
  // Slice 5d.4 of design/new/viewer-replacement.md removed the four
  // fork-targeted onLoad rewrites that used to live alongside this hook
  // (BufferGeometryUtils `mergeBufferGeometries` alias, planes.js
  // `TransformControls.getHelper()`, scene.js light-intensity ×π, context.js
  // `Clock` shim) plus their string-rewrite helpers — they patched
  // `web-ifc-viewer` / `web-ifc-three` source that no longer loads now that
  // the fork is gone. This resolve hook stays: it's engine-agnostic and
  // unblocks the three bump in slice 5e. The why for each removed rewrite is
  // recorded in viewer-replacement.md §6.
  const threeJsmCompatPlugin = {
    name: 'threeJsmCompat',
    setup(build) {
      build.onResolve({filter: /^three\/examples\/jsm\/[^.]+$/}, async (args) => {
        if (args.path.endsWith('.js')) {
          return null
        }
        const patched = await build.resolve(`${args.path}.js`, {
          kind: args.kind,
          resolveDir: args.resolveDir,
        })
        if (patched.errors.length > 0) {
          return null // let esbuild surface the original failure
        }
        return patched
      })
    },
  }

  // Initialize plugins array
  const plugins = [
    progress(),
    threeJsmCompatPlugin,
    fontDisplayPlugin,
    svgrPlugin({plugins: ['@svgr/plugin-jsx'], dimensions: false}),
    copyStaticFiles({
      src: assetsDir,
      dest: buildDir,
    }),
  ]

  // Conditionally include webIfcShimAliasPlugin
  if (isWebIfcShimEnabled) {
    plugins.push(webIfcShimAliasPlugin)
    log('Engine: conway (via web-ifc shim)')
  } else {
    plugins.push(webIfcSingleThreadPlugin)
    log('Engine: web-ifc (single-threaded; MT pinned off — see webIfcSingleThreadPlugin)')
  }

  return plugins
}
