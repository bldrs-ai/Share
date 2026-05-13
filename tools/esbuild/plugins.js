import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import copyStaticFiles from 'esbuild-copy-static-files'
import progress from 'esbuild-plugin-progress'
import svgrPlugin from 'esbuild-plugin-svgr'
import {isWebIfcShimEnabled} from './defines.js'
import {log} from './utils.js'


// -- threeJsmCompat helpers --------------------------------------------------
//
// Pure string-transform helpers used by the `threeJsmCompat` esbuild plugin
// to patch the vendored `web-ifc-viewer` / `web-ifc-three` fork for modern
// three. Exposed as exports so they can be unit-tested independently of
// esbuild's filesystem layer (see `plugins.test.js`). Each helper throws on
// a no-op rewrite — the explicit assertion is what protects us from a
// silent build-time pass when the fork's source shape drifts (e.g., yarn
// pulls a repackaged tarball with whitespace differences). When that
// happens the build fails loudly with the helper name, instead of the
// regression resurfacing at runtime months later.


/**
 * Assert that a `.replace()` actually changed the string. Throw otherwise.
 * The "rewrite no-op" failure mode is the biggest risk of the build-time
 * patch strategy — without this guard a fork reshuffle would silently
 * re-introduce the bug each rewrite was added to fix.
 *
 * @param {string} before pre-replace source
 * @param {string} after post-replace source
 * @param {string} label human-readable identifier of the rewrite
 * @return {string} the post-replace source (for chaining)
 */
export function assertReplaced(before, after, label) {
  if (before === after) {
    throw new Error(
      `[threeJsmCompat] rewrite "${label}" did not match its target — ` +
      `did the fork's or three.js's source shape change? See tools/esbuild/plugins.js.`)
  }
  return after
}


/**
 * Append a `mergeBufferGeometries → mergeGeometries` alias to three's
 * BufferGeometryUtils. The fork still imports the pre-r155 name; modern
 * three only exports `mergeGeometries`. Append-only: no rewrite assertion
 * (the alias is unconditional and a future three release that already
 * exports `mergeBufferGeometries` would just duplicate the binding — still
 * valid ES module syntax).
 *
 * @param {string} src
 * @return {string}
 */
export function shimBufferGeometryUtils(src) {
  return `${src}\nexport { mergeGeometries as mergeBufferGeometries } from './BufferGeometryUtils.js'\n`
}


/**
 * Rewrite the fork's `IfcPlane` (display/clipping-planes/planes.js) for
 * three r155+'s `TransformControls`, which no longer extends `Object3D`
 * (the gizmo is reachable via `controls.getHelper()`). The fork pre-r155
 * treated `controls` itself as a scene-graph node; five call-sites need
 * patching, each guarded so a fork-source drift fails the build.
 *
 * @param {string} src
 * @return {string}
 */
export function patchPlanesTransformControls(src) {
  const helperExpr = '(controls.getHelper ? controls.getHelper() : controls)'
  const thisHelperExpr = '(this.controls.getHelper ? this.controls.getHelper() : this.controls)'
  let out = src
  out = assertReplaced(out, out.replace(
    /scene\.add\(controls\);/, `scene.add(${helperExpr});`),
  'planes.js: scene.add(controls)')
  out = assertReplaced(out, out.replace(
    /this\.context\.renderer\.postProduction\.excludedItems\.add\(controls\);/,
    `this.context.renderer.postProduction.excludedItems.add(${helperExpr});`),
  'planes.js: postProduction.excludedItems.add(controls)')
  out = assertReplaced(out, out.replace(
    /controls\.children\[0\]\.children\[0\]\.add\(this\.arrowBoundingBox\);/,
    `${helperExpr}.children[0].children[0].add(this.arrowBoundingBox);`),
  'planes.js: controls.children[0].children[0].add(arrowBoundingBox)')
  out = assertReplaced(out, out.replace(
    /this\.controls\.visible = state;/, `${thisHelperExpr}.visible = state;`),
  'planes.js: this.controls.visible = state')
  out = assertReplaced(out, out.replace(
    /this\.controls\.removeFromParent\(\);/, `${thisHelperExpr}.removeFromParent();`),
  'planes.js: this.controls.removeFromParent()')
  return out
}


/**
 * Scale the fork's hardcoded light intensities by `Math.PI` to compensate
 * for three r157's removal of `useLegacyLights`. Same numeric value
 * produces ~π× less light under the new physically-correct defaults.
 *
 * @param {string} src
 * @return {string}
 */
export function scaleLightIntensities(src) {
  let out = src
  out = assertReplaced(out, out.replace(
    /new DirectionalLight\(0xffeeff, 0\.8\)/,
    'new DirectionalLight(0xffeeff, 0.8 * Math.PI)'),
  'scene.js: DirectionalLight(0xffeeff, 0.8)')
  out = assertReplaced(out, out.replace(
    /new DirectionalLight\(0xffffff, 0\.8\)/,
    'new DirectionalLight(0xffffff, 0.8 * Math.PI)'),
  'scene.js: DirectionalLight(0xffffff, 0.8)')
  out = assertReplaced(out, out.replace(
    /new AmbientLight\(0xffffee, 0\.25\)/,
    'new AmbientLight(0xffffee, 0.25 * Math.PI)'),
  'scene.js: AmbientLight(0xffffee, 0.25)')
  return out
}


/**
 * Strip `Clock` from the fork's `three` import and inline a tiny
 * API-compatible replacement (constructor + getDelta only — all the fork
 * uses). r183 deprecated `THREE.Clock`; this silences the console.warn
 * without rewiring the render loop. `Timer` isn't a drop-in.
 *
 * @param {string} src
 * @return {string}
 */
export function shimClock(src) {
  let matched = false
  const out = src.replace(
    /import \{([^}]*)\bClock\b,?\s*([^}]*)\} from 'three';/,
    (m, before, after) => {
      matched = true
      const names = `${before}${after}`.split(',').map((s) => s.trim()).filter(Boolean).join(', ')
      return `import { ${names} } from 'three';\n` +
        '/* Clock shim: drop-in for the fork\'s `new Clock(true)` / `getDelta()` usage. ' +
        'r183 deprecated THREE.Clock; this avoids the console.warn without rewiring the render loop. */\n' +
        'class Clock { constructor() { this._last = performance.now(); } ' +
        'getDelta() { const now = performance.now(); const d = (now - this._last) / 1000; this._last = now; return d; } }\n'
    })
  if (!matched) {
    throw new Error(
      `[threeJsmCompat] rewrite "context.js: Clock import strip" did not match its target — ` +
      `did the fork's import line change shape? See tools/esbuild/plugins.js.`)
  }
  return out
}


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


  // Compatibility shim for the legacy `web-ifc-viewer` / `web-ifc-three`
  // fork (vendored in node_modules) running against modern three. Five
  // hooks, all targeted at fork-vendored files only — our own code is
  // not touched. Every rewrite throws if it didn't match its target so
  // a future fork repack surfaces at build time, not at runtime months
  // later. The whole plugin goes away with Phase 5 of
  // `design/new/viewer-replacement.md` (fork removal).
  //
  //   onResolve  three/examples/jsm/*    — append `.js` (modern three's
  //                                        `exports` field requires it)
  //   onLoad     BufferGeometryUtils.js  — alias `mergeBufferGeometries`
  //                                        to the renamed `mergeGeometries`
  //   onLoad     fork's planes.js        — `TransformControls.getHelper()`
  //                                        (r155+ — no longer an Object3D)
  //   onLoad     fork's scene.js         — light intensities × Math.PI
  //                                        (r157 physically-correct lights)
  //   onLoad     fork's context.js       — inline Clock replacement
  //                                        (r183 deprecation warning)
  //
  // Each rewrite's *why* is also documented in `viewer-replacement.md` §6.
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

      build.onLoad({filter: /three[/\\]examples[/\\]jsm[/\\]utils[/\\]BufferGeometryUtils\.js$/}, async (args) => {
        const src = await fs.readFile(args.path, 'utf8')
        return {contents: shimBufferGeometryUtils(src), loader: 'js', resolveDir: path.dirname(args.path)}
      })

      build.onLoad({filter: /web-ifc-viewer[/\\]dist[/\\]components[/\\]display[/\\]clipping-planes[/\\]planes\.js$/}, async (args) => {
        const src = await fs.readFile(args.path, 'utf8')
        return {contents: patchPlanesTransformControls(src), loader: 'js', resolveDir: path.dirname(args.path)}
      })

      build.onLoad({filter: /web-ifc-viewer[/\\]dist[/\\]components[/\\]context[/\\]scene\.js$/}, async (args) => {
        const src = await fs.readFile(args.path, 'utf8')
        return {contents: scaleLightIntensities(src), loader: 'js', resolveDir: path.dirname(args.path)}
      })

      build.onLoad({filter: /web-ifc-viewer[/\\]dist[/\\]components[/\\]context[/\\]context\.js$/}, async (args) => {
        const src = await fs.readFile(args.path, 'utf8')
        return {contents: shimClock(src), loader: 'js', resolveDir: path.dirname(args.path)}
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
