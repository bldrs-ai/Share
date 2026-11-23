/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import path from 'path'
import {buildSync} from 'esbuild'


/**
 * Import-graph guard for the engine worker bundle (`Engine.worker.js`).
 *
 * The worker has no DOM, no store and no three, and the modules it runs —
 * the engine handler, and since engine-worker.md §7 step 5 the GLB writer's
 * engine captures (`loader/glbEngineCapture.js`) — are written to need none
 * of them. Nothing at runtime says so when one creeps back in: the GLB
 * capture's old home, `bldrsElementProperties.js`, imports the store for its
 * reader's alert, and the store's module touches `window` at import time, so
 * importing it from the worker graph would kill the worker at evaluation
 * (the same `window is not defined` it raised under Node). The page then
 * falls back to the in-process engine after the init timeout, and the only
 * symptom is a slower load. So the graph itself is checked, as esbuild
 * resolves it for the real bundle (tools/esbuild/build.js).
 */
describe('engine worker import graph', () => {
  const repoRoot = path.resolve(__dirname, '../..')

  /** @return {Array<string>} every module in the bundle, repo-relative */
  function workerInputs() {
    const result = buildSync({
      entryPoints: [path.join(repoRoot, 'src/engine/Engine.worker.js')],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
      // Conway is the engine itself, and a dependency, not Share code; it is
      // checked by its own platform tests (conway#540).
      external: ['@bldrs-ai/conway', '@bldrs-ai/conway/*'],
    })
    return Object.keys(result.metafile.inputs)
  }

  it('reaches the GLB writer\'s capture job, so the guard covers it', () => {
    // Without this the guard below could pass on a graph that no longer
    // contains the code it exists to protect.
    expect(workerInputs()).toEqual(expect.arrayContaining([
      'src/loader/glbEngineCapture.js',
      'src/loader/bldrsElementPropertiesCapture.js',
      'src/loader/bldrsSpatialTree.js',
    ]))
  })

  it('imports no store, React, MUI or three', () => {
    const forbidden = workerInputs().filter((input) =>
      input.startsWith('src/store/') ||
      /^node_modules\/(three|react|react-dom|@mui|zustand)\//.test(input) ||
      input.endsWith('.jsx'))
    expect(forbidden).toEqual([])
  })
})
