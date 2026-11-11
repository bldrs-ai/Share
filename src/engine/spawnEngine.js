// Where a model session's engine runs (design/new/engine-worker.md §5,
// §8 item 6): in its own module Worker by default under
// `?feature=engineWorker`, or in process — on this thread, through the same
// handler and protocol — where module workers are missing or the caller
// asks for it.
import {isFeatureEnabled} from '../FeatureFlags'
import {EngineSession} from './EngineSession'
import {createEngineHandler} from './engineHandler'
import {Ev} from './protocol'
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
    disableEngineSidecar: isFeatureEnabled('disableEngineSidecar'),
    disableEngineResidentSource: isFeatureEnabled('disableEngineResidentSource'),
    engineHeldBufferOpen: isFeatureEnabled('engineHeldBufferOpen'),
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
  // Registered before init, not after: a session still initialising can
  // already be on its way to an open, and must be closable by a page-wide
  // close too.
  liveSessions.add(session)
  session.on(Ev.FAILED, () => liveSessions.delete(session))
  try {
    await session.init({verbose: isFeatureEnabled('glbVerbose'), flags: engineFlagSnapshot(), timeoutMs})
  } catch (e) {
    session.close()
    throw e
  }
  return session
}


// Every session not yet closed or crashed (`failed` fires for both),
// initialising ones included, so a page-wide action can end them all:
// closeAllEngineSessions.
const liveSessions = new Set()


/**
 * Close every live engine session, and wait until each has let go of what
 * it holds. Clearing the OPFS cache needs this first: an engine reading its
 * model through a read-only sync access handle locks that model's OPFS
 * entry against removal (engine-worker.md §7 step 4), and the clear would
 * have to skip it. The page reloads after a clear, so nothing is lost by
 * closing the models on screen.
 *
 * Only a session whose open or spill has replied is known to hold a handle,
 * and only it is closed politely (EngineSession#close), after any spill still
 * in flight has replied; one still opening is terminated, and its lock goes
 * shortly AFTER this resolves. A caller that
 * must see the entry free (ProfileControl's clear) retries what it skipped.
 *
 * @return {Promise<number>} how many sessions were closed
 */
export async function closeAllEngineSessions() {
  const sessions = Array.from(liveSessions)
  liveSessions.clear()
  await Promise.all(sessions.map((session) => session.close()))
  return sessions.length
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
