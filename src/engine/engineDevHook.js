import {spawnEngineSession} from './spawnEngine'


/**
 * Install `window.__bldrsEngine`, for Playwright and the console to drive
 * engine sessions before any load goes through them (engine-worker.md §7
 * step 2). CadView installs it only under `?feature=engineWorker`.
 *
 * Sessions stay in this module, keyed by a small integer handle, because a
 * session object cannot cross `page.evaluate`; every result here is plain
 * data.
 *
 *   spawn({inProcess})           → {handle, kind, conwayVersion, capabilities, wasmBytes}
 *   open(handle, url)            → {modelID, windowed, openMs}  (fetched as a Blob,
 *                                  so the open is windowed where it can be)
 *   tree(handle, {mode, includeSolids})
 *   properties(handle, id, {recursive})
 *   propertySets(handle, id)
 *   stats(handle)                → {wasmBytes, modelID}
 *   close(handle)                → true
 *
 * @param {object} [target] where to install (the window)
 * @return {Function} uninstall, which also closes every open session
 */
export function installEngineDevHook(target = window) {
  const sessions = new Map()
  let nextHandle = 1
  const sessionFor = (handle) => {
    const session = sessions.get(handle)
    if (!session) {
      throw new Error(`__bldrsEngine: no session ${handle}`)
    }
    return session
  }
  target.__bldrsEngine = {
    async spawn({inProcess = false} = {}) {
      const session = await spawnEngineSession({inProcess})
      const handle = nextHandle++
      sessions.set(handle, session)
      const stats = await session.stats()
      return {
        handle,
        kind: session.kind,
        capabilities: session.capabilities,
        wasmBytes: stats.wasmBytes,
      }
    },
    async open(handle, url) {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`__bldrsEngine: fetch ${url} → ${response.status}`)
      }
      return await sessionFor(handle).open({file: await response.blob()})
    },
    tree: (handle, opts) => sessionFor(handle).tree(opts),
    properties: (handle, id, opts) => sessionFor(handle).properties(id, opts),
    propertySets: (handle, id) => sessionFor(handle).propertySets(id),
    stats: (handle) => sessionFor(handle).stats(),
    close(handle) {
      // Kept in the map, closed: a later read then fails the way a real
      // consumer's would (`engine session closed`), which is what a test of
      // close wants to see, rather than with this hook's own lookup error.
      // A closed session holds no engine.
      sessionFor(handle).close()
      return true
    },
  }
  return () => {
    for (const session of sessions.values()) {
      session.close()
    }
    sessions.clear()
    delete target.__bldrsEngine
  }
}
