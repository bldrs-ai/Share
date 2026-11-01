import {useEffect} from 'react'
import {useAuth0} from '../Auth0/Auth0Proxy'
import useStore from '../store/useStore'
import {googleDriveProvider} from './google-drive/GoogleDriveProvider'
import {loadConnections, loadSources, saveConnections, saveSources} from './persistence'


const DRIVE_PROVIDER_ID = 'google-drive'


/**
 * Forget every Google Drive connection: its access token (localStorage, and
 * revoked at Google when this page holds it, as ConnectionCard's Remove
 * does), the persisted connection and its sources, and the store's copy.
 *
 * Works from the persisted list as well as the store's, so it is safe to run
 * before useConnectionsInit has hydrated the store: it never rewrites the
 * persisted list from a store that hasn't loaded it yet, which would drop
 * GitHub connections along with Drive.
 *
 * @return {Promise<number>} how many Drive connections were cleared
 */
export async function clearDriveConnections() {
  const storeState = useStore.getState()
  const persisted = loadConnections()
  const driveIds = new Set([...persisted, ...storeState.connections]
    .filter((c) => c.providerId === DRIVE_PROVIDER_ID)
    .map((c) => c.id))
  if (driveIds.size === 0) {
    return 0
  }
  saveConnections(persisted.filter((c) => !driveIds.has(c.id)))
  saveSources(loadSources().filter((s) => !driveIds.has(s.connectionId)))
  for (const id of driveIds) {
    if (storeState.connections.some((c) => c.id === id)) {
      // Cascades to the connection's sources in the store.
      storeState.removeConnection(id)
    }
    try {
      await googleDriveProvider.disconnect(id)
    } catch {
      // Token revocation at Google is best effort; the local token is
      // cleared before revoke is attempted.
    }
  }
  return driveIds.size
}


/**
 * Clears Google Drive connections whenever Auth0 settles signed out.
 *
 * A private model needs a Bldrs sign-in AND the provider's authorization
 * (design/new/quotas.md §"What counts"). Drive's token lives in localStorage
 * and outlives the Auth0 session, so without this a user who signs out keeps
 * opening restricted Drive files, unmetered, since signed-out users are
 * never metered. It is also hygiene on a shared computer: signing out of
 * Bldrs no longer leaves the next person a working Drive connection.
 *
 * Keyed on the settled state, not on a logout call, so every way of signing
 * out is covered: ProfileControl, BaseRoutes' invalid_grant logout, the Open
 * dialog's GitHub Remove, and a session that simply ended between visits.
 * Connecting Drive needs a sign-in (ConnectProviderButton), so a signed-out
 * user has no Drive connection to lose. Nothing is cleared while Auth0 is
 * still loading. CadView separately refuses to use a Drive connection while
 * signed out, for a load that starts before this effect runs.
 */
export default function useSignedOutDriveCleanup() {
  const {isLoading, isAuthenticated} = useAuth0()
  const connections = useStore((state) => state.connections)

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      return
    }
    clearDriveConnections()
  }, [isLoading, isAuthenticated, connections])
}
