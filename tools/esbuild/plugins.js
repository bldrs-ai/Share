import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import copyStaticFiles from 'esbuild-copy-static-files'
import progress from 'esbuild-plugin-progress'
import svgrPlugin from 'esbuild-plugin-svgr'


/**
 * @param {string} root - Root directory
 * @param {string} buildDir - Build directory
 * @return {object}
 */
export default function makePlugins(root, buildDir) {
  // Resolve the bare `'web-ifc'` specifier to Conway's web-ifc compat
  // surface (the same file the `@bldrs-ai/conway/web-ifc` subpath export
  // names). Share's own code imports that subpath directly and no longer
  // depends on the real `web-ifc` package, so this alias exists only for
  // one transitive import: `@bldrs-ai/ifclib`'s `src/IfcModel.js` does
  // `import * as WebIFC from 'web-ifc'` (reached via its `src/index.js` →
  // `ifctool.js` re-export). Today `IfcModel.js` tree-shakes out of the
  // bundle, but esbuild still resolves its imports; without the alias that
  // would reach the real web-ifc that ifclib still depends on (and pull it
  // in outright if Share ever used `IfcModel`). Drop this plugin once
  // ifclib stops depending on web-ifc.
  const webIfcToConwayAliasPlugin = {
    name: 'webIfcToConwayAlias',
    setup(build) {
      build.onResolve({filter: /^web-ifc$/}, (args) => {
        return {
          path: path.resolve(root, 'node_modules/@bldrs-ai/conway/compiled/src/compat/web-ifc/index.js'),
        }
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

  // Initialize plugins array.
  //
  // `copyStaticFiles` is deliberately NOT here — see `makeStaticCopyPlugin`.
  const plugins = [
    progress(),
    threeJsmCompatPlugin,
    fontDisplayPlugin,
    svgrPlugin({plugins: ['@svgr/plugin-jsx'], dimensions: false}),
    webIfcToConwayAliasPlugin,
  ]

  return plugins
}


/**
 * The `public/` → `docs/` asset copy, as a plugin ONE build may own.
 *
 * It is kept out of `makePlugins` because the shared config is spread into
 * every build in `build.js`, and those builds run concurrently under a single
 * `Promise.all`. `esbuild-copy-static-files` creates its destination with a
 * check-then-`mkdir`, so five builds sharing one `dest` race it and the losers
 * throw `EEXIST: mkdir docs` — intermittently, since it depends on which two
 * land inside the window (#1852). Nothing was stale: `docs/` is gitignored, so
 * on CI the builds race to CREATE it, which is why clearing the directory
 * first never helped.
 *
 * Only the build that emits into `docs/` has any reason to copy the asset
 * tree. The worker bundles and the pro modules were each doing a redundant
 * full copy on top of that, four of them, for nothing.
 *
 * @param {string} root - Root directory
 * @param {string} buildDir - Build directory
 * @return {object} an esbuild plugin
 */
export function makeStaticCopyPlugin(root, buildDir) {
  return copyStaticFiles({
    src: path.resolve(root, 'public'),
    dest: buildDir,
  })
}
