// A stand-in for `engine/engineModelLoad.js#createEngineModelLoad`, for the
// tests of `ShareIfcLoader#parse` itself: the engine's side of a load played
// by a function, so a test sets exactly what the engine delivered (batches,
// the index, a recapture) and asserts on what the parse built from it. The
// real load is engine/engineModelLoad.test.js's subject, and the two engines
// behind it engine/engineContract.test.js's.


/**
 * A fake `Engine` (engine/Engine.js): the members `ShareIfcLoader#parse` and
 * the model's reads touch.
 *
 * @param {object} [options]
 * @param {string} [options.kind] `mainThread` (a ConwayEngine) or `worker`
 * @param {boolean} [options.canRecapture] `capabilities.recapture`; a
 *   ConwayEngine has it, a WorkerEngine not
 * @param {number} [options.modelID]
 * @return {object}
 */
export function makeFakeEngine({kind = 'mainThread', canRecapture = kind === 'mainThread', modelID = 4} = {}) {
  return {
    kind,
    modelID,
    closed: false,
    capabilities: {recapture: canRecapture},
    init: jest.fn(() => Promise.resolve({conwayVersion: 'test'})),
    close: jest.fn(() => Promise.resolve()),
    tree: jest.fn(() => Promise.resolve({expressID: 1, children: []})),
    properties: jest.fn((id) => Promise.resolve({expressID: id})),
    propertySets: jest.fn(() => Promise.resolve([])),
  }
}


/**
 * A fake model load over `engine`, whose `parse` runs `play(callbacks)` as
 * the engine's part and resolves with what it returns, defaulting
 * `recapture` to an empty stream.
 *
 * @param {object} options
 * @param {object} options.ifcAPI the load's alias (`load.ifcAPI`), the stub
 *   the tail of `parse` reads (coordination, statistics)
 * @param {function(object): Promise<object>|object} options.play given
 *   `{onProgress, onMeshBatch, onPreviewMesh, onIndexed}`; resolves to
 *   `{modelID, recapture}`, or throws as a failed load
 * @param {object} [options.engine] from {@link makeFakeEngine}
 * @return {object} `{ifcAPI, engine, parse, abort, aborted}`
 */
export function makeFakeEngineLoad({ifcAPI, play, engine = makeFakeEngine()}) {
  ifcAPI.engine = engine
  const load = {
    ifcAPI,
    engine,
    aborted: false,
    abort: jest.fn(() => {
      load.aborted = true
      engine.close()
    }),
    parse: jest.fn(async (buffer, callbacks) => ({
      modelID: engine.modelID,
      recapture: () => Promise.resolve([]),
      ...(await play(callbacks, buffer)),
    })),
  }
  return load
}
