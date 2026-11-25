import {useEffect, useRef} from 'react'
import {ModelSessionHost} from '../session/modelSession'


/**
 * The model sessions one view binds to (session/modelSession.js; open-205
 * #2019, design/new/in-app-model-switch.md §4.9), for the life of the
 * component, and closed when it unmounts. Per component, not module state,
 * so two mounts in one process (tests, a remount across route families)
 * never share a session.
 *
 * Closing on unmount: an in-app open across route families (`/v/p`, `/v/gh`
 * and `/v/local-only` sit under one parent route; `/v/u` and `/v/g` do not,
 * ShareRoutes.jsx) remounts Share and CadView, and the next CadView builds a
 * new viewer and disposes the store's one. Left running, the old instance's
 * load streamed into that disposed viewer and failed at its scene: an alert,
 * a Sentry capture, and `load_failed`, over the model the user had just
 * opened (found by step F's burn-in, GoogleDriveConnect.spec.ts: a Drive pick
 * from a hosted model). The session is closed without forgetting the store's
 * model state: the next view forgets it when it opens its own session.
 * Checked a microtask later, defensively: StrictMode (index.jsx) runs the
 * cleanup and the effect again at once in development, which is no unmount,
 * and a load already started then (a remount into the store's viewer) would
 * be given up and started again for nothing.
 *
 * @param {Function} onForget ModelSessionHost's `onForget`. The latest one is
 *   called, so it may close over the current render.
 * @return {ModelSessionHost}
 */
export default function useModelSessionHost(onForget) {
  const onForgetRef = useRef(onForget)
  onForgetRef.current = onForget
  const hostRef = useRef(null)
  if (hostRef.current === null) {
    hostRef.current = new ModelSessionHost({onForget: (options) => onForgetRef.current(options)})
  }
  const isMountedRef = useRef(false)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      queueMicrotask(() => {
        if (!isMountedRef.current) {
          hostRef.current.closeActive()
        }
      })
    }
  }, [])
  return hostRef.current
}
