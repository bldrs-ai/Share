import {useEffect} from 'react'
import useStore from '../store/useStore'
import {loadConnections, loadSources} from './persistence'


/**
 * Hydrates Connections and Sources from localStorage on first render.
 * All loaded connections will have status 'disconnected' and need
 * re-validation by their respective providers.
 */
export default function useConnectionsInit() {
  const addConnection = useStore((state) => state.addConnection)
  const addSource = useStore((state) => state.addSource)
  const connections = useStore((state) => state.connections)

  useEffect(() => {
    // Only hydrate if store is empty (first load)
    if (connections.length > 0) {
      return
    }
    const savedConnections = loadConnections()
    const savedSources = loadSources()
    savedConnections.forEach((c) => addConnection(c))
    savedSources.forEach((s) => addSource(s))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
