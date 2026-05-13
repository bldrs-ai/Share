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


  // Compatibility shim for legacy three.js consumers (web-ifc-viewer,
  // web-ifc-three vendored in node_modules) running against modern
  // three. Two adjustments:
  //
  // 1. Modern three's package.json `exports` field maps
  //    `./examples/jsm/*` literally — no automatic `.js` extension
  //    fallback. The fork imports these without the extension; we
  //    re-resolve with `.js` appended.
  //
  // 2. `mergeBufferGeometries` was renamed to `mergeGeometries` in
  //    three r155+. The fork still imports the old name. We intercept
  //    loads of `BufferGeometryUtils.js` and append the alias.
  //
  // Both go away when the fork is removed (Phase 5 of
  // design/new/viewer-replacement.md).
  const threeJsmExtPlugin = {
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

      build.onLoad({filter: /three[/\\]examples[/\\]jsm[/\\]utils[/\\]BufferGeometryUtils\.js$/}, async (args) => {
        const original = await fs.readFile(args.path, 'utf8')
        // `mergeGeometries` is the new name; alias the old.
        const shim = '\nexport { mergeGeometries as mergeBufferGeometries } from \'./BufferGeometryUtils.js\'\n'
        return {contents: original + shim, loader: 'js', resolveDir: path.dirname(args.path)}
      })
    },
  }

  // Initialize plugins array
  const plugins = [
    progress(),
    threeJsmExtPlugin,
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
