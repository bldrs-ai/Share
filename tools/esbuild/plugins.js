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

      // The fork's `IfcPlane` (display/clipping-planes/planes.js) treats
      // the `TransformControls` instance itself as an Object3D — it does
      // `scene.add(controls)` and reaches into `controls.children[0]...`.
      // In three r155+ TransformControls extends `Controls` (not
      // Object3D); the gizmo is exposed via `controls.getHelper()`. The
      // fork was written for the pre-r155 shape, so we rewrite the four
      // affected lines on load. Without this, clicking any section plane
      // throws `Cannot read properties of undefined (reading '0')` at
      // planes.js#initializeControls. Goes away with §3c unified Clipper.
      build.onLoad({filter: /web-ifc-viewer[/\\]dist[/\\]components[/\\]display[/\\]clipping-planes[/\\]planes\.js$/}, async (args) => {
        let src = await fs.readFile(args.path, 'utf8')
        const helperExpr = '(controls.getHelper ? controls.getHelper() : controls)'
        const thisHelperExpr = '(this.controls.getHelper ? this.controls.getHelper() : this.controls)'
        src = src
          .replace(/scene\.add\(controls\);/, `scene.add(${helperExpr});`)
          .replace(
            /this\.context\.renderer\.postProduction\.excludedItems\.add\(controls\);/,
            `this.context.renderer.postProduction.excludedItems.add(${helperExpr});`)
          .replace(
            /controls\.children\[0\]\.children\[0\]\.add\(this\.arrowBoundingBox\);/,
            `${helperExpr}.children[0].children[0].add(this.arrowBoundingBox);`)
          .replace(/this\.controls\.visible = state;/, `${thisHelperExpr}.visible = state;`)
          .replace(/this\.controls\.removeFromParent\(\);/, `${thisHelperExpr}.removeFromParent();`)
        return {contents: src, loader: 'js', resolveDir: path.dirname(args.path)}
      })

      // The fork's `IfcScene` (context/scene.js) hard-codes light
      // intensities that were tuned for three r135's legacy
      // `useLegacyLights = true` regime. In r157+ that flag was
      // removed; defaults are physically-correct intensities, where the
      // same numeric value produces ~π× less light. The migration
      // guidance: multiply legacy intensities by π. Restores the r135
      // visual baseline when paired with `ColorManagement.enabled =
      // false` and `outputColorSpace = LinearSRGBColorSpace` in
      // ShareViewer.constructor (which together disable r152+ Managed
      // color mode end-to-end). Goes away when ShareViewer owns its
      // own scene (Phase 5 of design/new/viewer-replacement.md).
      build.onLoad({filter: /web-ifc-viewer[/\\]dist[/\\]components[/\\]context[/\\]scene\.js$/}, async (args) => {
        let src = await fs.readFile(args.path, 'utf8')
        src = src
          .replace(/new DirectionalLight\(0xffeeff, 0\.8\)/, 'new DirectionalLight(0xffeeff, 0.8 * Math.PI)')
          .replace(/new DirectionalLight\(0xffffff, 0\.8\)/, 'new DirectionalLight(0xffffff, 0.8 * Math.PI)')
          .replace(/new AmbientLight\(0xffffee, 0\.25\)/, 'new AmbientLight(0xffffee, 0.25 * Math.PI)')
        return {contents: src, loader: 'js', resolveDir: path.dirname(args.path)}
      })

      // The fork's `IfcContext` does `new Clock(true)` once at
      // construction. r183 deprecated `THREE.Clock` and emits a
      // `console.warn` on every instantiation. Three's replacement
      // (`Timer`) has different semantics — it requires explicit
      // per-frame `update()` calls and lacks Clock's auto-start
      // behavior. Rather than rewire the fork's render loop, we
      // replace the Clock import with a tiny API-compatible inline
      // class (constructor + getDelta only — the only methods the
      // fork uses). Goes away with Phase 5.
      build.onLoad({filter: /web-ifc-viewer[/\\]dist[/\\]components[/\\]context[/\\]context\.js$/}, async (args) => {
        let src = await fs.readFile(args.path, 'utf8')
        // Strip Clock from the three import (other names preserved).
        src = src
          .replace(/import \{([^}]*)\bClock\b,?\s*([^}]*)\} from 'three';/, (m, before, after) => {
            const names = `${before}${after}`.split(',').map((s) => s.trim()).filter(Boolean).join(', ')
            return `import { ${names} } from 'three';\n` +
              '/* Clock shim: drop-in for the fork\'s `new Clock(true)` / `getDelta()` usage. ' +
              'r183 deprecated THREE.Clock; this avoids the console.warn without rewiring the render loop. */\n' +
              'class Clock { constructor() { this._last = performance.now(); } ' +
              'getDelta() { const now = performance.now(); const d = (now - this._last) / 1000; this._last = now; return d; } }\n'
          })
        return {contents: src, loader: 'js', resolveDir: path.dirname(args.path)}
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
