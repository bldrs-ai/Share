/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
// Static guard on what the geometry worker pool costs a load that never uses
// it (Share#1760).
//
// The pool is behind `?feature=workers`, off by default, so every ordinary
// load pays only for whatever the flag branch drags into the MAIN bundle.
// The worker entry imports the whole conway engine — its own bundle is
// ~5.8 MB — so a static `import` of it from anywhere the loader reaches
// would put a second copy of the engine in front of every user, flag or no
// flag, and the symptom would be a slower cold start with nothing in the
// diff that looks like a cost. That is precisely the regression this issue
// was opened on, and reading imports is not enough to rule it out: what
// matters is what the bundler resolves.
//
// So this asserts against the module graph esbuild actually walks from the
// loader — the same resolution the real build does — rather than against the
// source text. The worker may only ever be reached through
// `new Worker(new URL('./ConwayGeometry.worker.js', import.meta.url))`, which
// esbuild leaves alone as a runtime URL, and which is why the worker's bundle
// is built as its own entry point in `tools/esbuild/build.js`.
//
// Mutation check: adding `import './ConwayGeometry.worker'` to
// `conwayGeometryPool.js` fails this test.
import * as path from 'node:path'
import esbuild from 'esbuild'


const repoRoot = path.resolve(__dirname, '../../..')

/* The main thread's entry into the pool. Everything the flag branch can pull
 * in reaches the main bundle through this module. */
const LOADER = 'src/viewer/ifc/conwayDirectIfcLoader.js'

const WORKER = 'src/viewer/ifc/ConwayGeometry.worker.js'

/* esbuild's own default is 10s; bundling ~60 first-party modules takes ~50ms,
 * but a cold esbuild binary start on a loaded CI runner deserves slack. */
const TIMEOUT_MS = 30000


/**
 * Every first-party module esbuild reaches from `entry`.
 *
 * Bare specifiers are externalised so this walks Share's own sources only:
 * the question is which of OUR modules end up in the main bundle, and
 * resolving three/react/conway as well would take seconds and answer nothing.
 *
 * @param {string} entry repo-relative path to the entry module
 * @return {Promise<Array<string>>} repo-relative input paths
 */
async function moduleGraph(entry) {
  const result = await esbuild.build({
    entryPoints: [path.resolve(repoRoot, entry)],
    absWorkingDir: repoRoot,
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    logLevel: 'silent',
    plugins: [{
      name: 'externalize-packages',
      setup(build) {
        build.onResolve({filter: /^[^./]|^\.\.?$/}, (args) =>
          (args.kind === 'entry-point' ? null : {path: args.path, external: true}))
      },
    }],
  })
  return Object.keys(result.metafile.inputs)
}


describe('viewer/ifc: geometry worker pool bundle isolation', () => {
  it('keeps the worker entry out of the main bundle when the flag is off', async () => {
    const inputs = await moduleGraph(LOADER)

    // The pool module itself IS in the main bundle, and should be: it is a
    // few hundred lines of plain JS holding the flag check the loader asks
    // on every parse. It is the worker — and the engine behind it — that
    // must stay on the far side of a runtime URL.
    expect(inputs).toContain('src/viewer/ifc/conwayGeometryPool.js')
    expect(inputs).not.toContain(WORKER)
  }, TIMEOUT_MS)

  it('reaches no worker entry at all from the loader', async () => {
    // Broader than the assertion above: any `*.worker.js` in the main graph
    // is the same mistake with a different filename. Share's other workers
    // (OPFS, GlbWriter) are reached the same way, through a URL, and none of
    // them is on this path either.
    const inputs = await moduleGraph(LOADER)
    expect(inputs.filter((each) => each.endsWith('.worker.js'))).toEqual([])
  }, TIMEOUT_MS)
})
