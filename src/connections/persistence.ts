import type {Connection, Source} from './types'


const CONNECTIONS_KEY = 'bldrs:connections'
const SOURCES_KEY = 'bldrs:sources'


/**
 * Persist connections to localStorage.
 * Status is forced to 'disconnected' so tokens are re-validated on next load.
 */
export function saveConnections(connections: Connection[]): void {
  const safe = connections.map((c) => ({
    ...c,
    status: 'disconnected' as const,
  }))
  try {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(safe))
  } catch {
    // localStorage may be full or unavailable
  }
}


/** Load persisted connections. All will have status 'disconnected'. */
export function loadConnections(): Connection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY)
    if (!raw) {
      return []
    }
    return JSON.parse(raw)
  } catch {
    return []
  }
}


/** Persist sources to localStorage. */
export function saveSources(sources: Source[]): void {
  try {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(sources))
  } catch {
    // localStorage may be full or unavailable
  }
}


/** Load persisted sources. */
export function loadSources(): Source[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (!raw) {
      return []
    }
    return JSON.parse(raw)
  } catch {
    return []
  }
}


/** Clear all persisted connections and sources. */
export function clearAll(): void {
  localStorage.removeItem(CONNECTIONS_KEY)
  localStorage.removeItem(SOURCES_KEY)
}
