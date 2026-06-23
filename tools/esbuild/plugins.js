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
          path: path.resolve(root, 'node_modules/@bldrs-ai/conway-web-ifc-adapter/compiled/src/ifc_api.js'),
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
    log('Engine: web-ifc')
  }

  return plugins
}
