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
// Set once a worker engine has failed to start on this page (see
// spawnEngineSession); later opens go straight to the in-process engine.
let workerFailedThisPage = false


/** Tests only: forget a previous worker failure. */
export function resetEngineWorkerFailureForTests() {
  workerFailedThisPage = false
}


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
  return {
    disableStreamOpen: isFeatureEnabled('disableStreamOpen'),
    disableEngineSyncHandle: isFeatureEnabled('disableEngineSyncHandle'),
  }
}


/**
 * Spawn and initialise one engine.
 *
 * @param {object} [options]
 * @param {boolean} [options.inProcess] force the main-thread transport
 * @param {function(): Worker} [options.makeWorker] for tests
 * @param {function(): Promise<Function>} [options.loadIfcAPI] in-process
 *   engine loader, for tests
 * @param {number} [options.initTimeoutMs] the worker's init clock
 *   (EngineSession ENGINE_INIT_TIMEOUT_MS), for tests
 * @return {Promise<EngineSession>} initialised
 */
export async function spawnEngineSession({
  inProcess = false,
  makeWorker = defaultMakeWorker,
  loadIfcAPI = () => import('@bldrs-ai/conway/web-ifc').then((m) => m.IfcAPI),
  initTimeoutMs = undefined,
} = {}) {
  const inProcessTransport = () =>
    makeInProcessTransport((post) => createEngineHandler({loadIfcAPI, post}))
  if (inProcess || workerFailedThisPage || !supportsModuleWorkers()) {
    return await initSession(inProcessTransport())
  }
  try {
    return await initSession(makeWorkerTransport(makeWorker()), initTimeoutMs)
  } catch (e) {
    // Remembered for the page's lifetime: what stopped this worker (a stale
    // cached script, a stalled fetch, a broken bundle) will stop the next
    // one too, and a stalled one costs the full init clock (30 s) per open.
    workerFailedThisPage = true
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
 * @param {number} [timeoutMs] init's clock; undefined for the default
 * @return {Promise<EngineSession>} initialised, or closed and rejected
 */
async function initSession(transport, timeoutMs = undefined) {
  const session = new EngineSession(transport, {epoch: nextEpoch++})
  try {
    await session.init({verbose: isFeatureEnabled('glbVerbose'), flags: engineFlagSnapshot(), timeoutMs})
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
