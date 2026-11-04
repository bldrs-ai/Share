// Where a model session's engine runs (design/new/engine-worker.md §5,
// §8 item 6): in its own module Worker by default under
// `?feature=engineWorker`, or in process — on this thread, through the same
// handler and protocol — where module workers are missing or the caller
// asks for it.
import {isFeatureEnabled} from '../FeatureFlags'
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {makeInProcessTransport, makeWorkerTransport} from './transports'


let nextEpoch = 1
let moduleWorkersSupported = null


/**
 * Feature-detect module workers once per page. Same probe as
 * `GlbWriterService.js` and `OPFSService.js`: constructing a module worker
 * throws synchronously where `{type: 'module'}` is unsupported.
 *
 * @return {boolean}
 */
export function supportsModuleWorkers() {
  if (moduleWorkersSupported !== null) {
    return moduleWorkersSupported
  }
  if (typeof Worker === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    moduleWorkersSupported = false
    return false
  }
  try {
    const url = URL.createObjectURL(new Blob([''], {type: 'application/javascript'}))
    new Worker(url, {type: 'module'}).terminate()
    URL.revokeObjectURL(url)
    moduleWorkersSupported = true
  } catch {
    moduleWorkersSupported = false
  }
  return moduleWorkersSupported
}


/**
 * The engine flags a worker cannot read for itself: it has no `?feature=`.
 *
 * @return {object}
 */
export function engineFlagSnapshot() {
  return {disableStreamOpen: isFeatureEnabled('disableStreamOpen')}
}


/**
 * Spawn and initialise one engine.
 *
 * @param {object} [options]
 * @param {boolean} [options.inProcess] force the main-thread transport
 * @param {function(): Worker} [options.makeWorker] for tests
 * @param {function(): Promise<Function>} [options.loadIfcAPI] in-process
 *   engine loader, for tests
 * @return {Promise<EngineSession>} initialised
 */
export async function spawnEngineSession({
  inProcess = false,
  makeWorker = defaultMakeWorker,
  loadIfcAPI = () => import('web-ifc').then((m) => m.IfcAPI),
} = {}) {
  const inProcessTransport = () =>
    makeInProcessTransport((post) => createEngineHandler({loadIfcAPI, post}))
  if (inProcess || !supportsModuleWorkers()) {
    return await initSession(inProcessTransport())
  }
  try {
    return await initSession(makeWorkerTransport(makeWorker()))
  } catch (e) {
    // The worker could not stand an engine up: its script failed to load,
    // it speaks another protocol version (a stale cached worker beside a new
    // page, ProtocolMismatchError), or it never answered init. The
    // in-process engine is the page's own build and always speaks its
    // version, so the load goes on there rather than failing (§8 item 6:
    // the fallback is permanent). Said once in the console, because a model
    // that silently lost its worker would look like a regression of
    // everything the worker buys.
    console.warn(`[engine] worker engine failed to start (${e?.name ?? 'Error'}: ${e?.message ?? e}); ` +
      'running this model\'s engine in process instead')
    return await initSession(inProcessTransport())
  }
}


/**
 * @param {object} transport
 * @return {Promise<EngineSession>} initialised, or closed and rejected
 */
async function initSession(transport) {
  const session = new EngineSession(transport, {epoch: nextEpoch++})
  try {
    await session.init({verbose: isFeatureEnabled('glbVerbose'), flags: engineFlagSnapshot()})
  } catch (e) {
    session.close()
    throw e
  }
  return session
}


/**
 * `Engine.worker.js` is built beside the main bundle (tools/esbuild/build.js),
 * so it resolves relative to this module's URL, like the GLB writer worker.
 *
 * @return {Worker}
 */
function defaultMakeWorker() {
  return new Worker(new URL('./Engine.worker.js', import.meta.url), {type: 'module'})
}
