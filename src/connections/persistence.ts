import type {Connection, Source} from './types'


const CONNECTIONS_KEY = 'bldrs:connections'
const SOURCES_KEY = 'bldrs:sources'
const RECENT_FILES_KEY = 'bldrs:recent-files'
const RECENT_FILES_VERSION = 1
const PENDING_MODEL_UPDATE_KEY = 'bldrs:pending-model-update'
const MAX_RECENT_PER_SOURCE = 4

/** Legacy key — migrated to RECENT_FILES_KEY on first load */
const LEGACY_GDRIVE_KEY = 'bldrs:recent-gdrive-files'


export type RecentFileSource = 'local' | 'google-drive' | 'github'


export interface RecentFileEntry {
  /** Dedup key: fileId (google-drive) | sharePath (github) | filename (local) */
  id: string
  source: RecentFileSource
  /** Original filename — used as tooltip and display fallback */
  name: string
  /** Extracted IFC model name — preferred for display when available */
  modelTitle?: string
  mimeType?: string
  lastModifiedUtc?: number | null
  /** Navigate path for local (/v/new/filename) and github (/v/gh/...) */
  sharePath?: string
  /** google-drive only */
  connectionId?: string
  /** google-drive only — same as id, kept for clarity */
  fileId?: string
}


interface RecentFilesStore {
  version: number
  files: RecentFileEntry[]
}


interface LegacyRecentFile {
  fileId: string
  name: string
  mimeType: string
  lastModifiedUtc: number | null
  connectionId: string
  modelTitle?: string
}


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


/**
 * Load persisted connections. All will have status 'disconnected'.
 *
 * @return Parsed connections array.
 */
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


/**
 * Load persisted sources.
 *
 * @return Parsed sources array.
 */
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


// ---------------------------------------------------------------------------
// Unified recent files store
// ---------------------------------------------------------------------------

/**
 * @return The versioned recent files store, migrating from legacy format if needed.
 */
function loadStore(): RecentFilesStore {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RecentFilesStore
      if (parsed.version === RECENT_FILES_VERSION) {
        return parsed
      }
      return {version: RECENT_FILES_VERSION, files: []}
    }
    return migrateFromLegacy()
  } catch {
    return {version: RECENT_FILES_VERSION, files: []}
  }
}


/**
 * One-time migration from the old bldrs:recent-gdrive-files key.
 *
 * @return Migrated store (empty if migration fails or nothing to migrate).
 */
function migrateFromLegacy(): RecentFilesStore {
  const store: RecentFilesStore = {version: RECENT_FILES_VERSION, files: []}
  try {
    const raw = localStorage.getItem(LEGACY_GDRIVE_KEY)
    if (raw) {
      const old = JSON.parse(raw) as LegacyRecentFile[]
      store.files = old.map((f) => ({
        id: f.fileId,
        source: 'google-drive' as const,
        name: f.name,
        modelTitle: f.modelTitle,
        mimeType: f.mimeType,
        lastModifiedUtc: f.lastModifiedUtc,
        connectionId: f.connectionId,
        fileId: f.fileId,
      }))
      localStorage.removeItem(LEGACY_GDRIVE_KEY)
      saveStore(store)
    }
  } catch {
    // Migration failed — start fresh
  }
  return store
}


/** @param store The store to persist */
function saveStore(store: RecentFilesStore): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(store))
  } catch {
    // localStorage may be full or unavailable
  }
}


/**
 * Load all recent file entries across all sources.
 *
 * @return All recent entries.
 */
export function loadAllRecentFiles(): RecentFileEntry[] {
  return loadStore().files
}


/**
 * Load recent entries for a specific source.
 *
 * @param source The source to filter by.
 * @return Entries for the given source.
 */
export function loadRecentFilesBySource(source: RecentFileSource): RecentFileEntry[] {
  return loadStore().files.filter((f) => f.source === source)
}


/**
 * Load recent entries for a specific Google Drive connection.
 *
 * @param connectionId The connection ID to filter by.
 * @return Entries for the given connection.
 */
export function loadRecentFilesByConnectionId(connectionId: string): RecentFileEntry[] {
  return loadStore().files.filter((f) => f.connectionId === connectionId)
}


/**
 * Prepend an entry to the recent list, deduplicating by id+source and capping
 * at MAX_RECENT_PER_SOURCE entries per source.
 *
 * @param entry The entry to add.
 */
export function addRecentFileEntry(entry: RecentFileEntry): void {
  const store = loadStore()
  const withoutDupe = store.files.filter(
    (f) => !(f.id === entry.id && f.source === entry.source),
  )
  const withNew = [entry, ...withoutDupe]
  const counts = new Map<RecentFileSource, number>()
  store.files = withNew.filter((f) => {
    const count = counts.get(f.source) ?? 0
    if (count >= MAX_RECENT_PER_SOURCE) {
      return false
    }
    counts.set(f.source, count + 1)
    return true
  })
  saveStore(store)
}


/**
 * Update the modelTitle of a recent entry by id.
 * No-op if no matching entry exists.
 *
 * @param id The entry id to update.
 * @param modelTitle The model title to set.
 */
export function updateRecentFileModelTitle(id: string, modelTitle: string): void {
  const store = loadStore()
  store.files = store.files.map((f) => f.id === id ? {...f, modelTitle} : f)
  saveStore(store)
}


/**
 * Update the lastModifiedUtc of a recent entry by id.
 * No-op if no matching entry exists.
 *
 * @param id The entry id to update.
 * @param lastModifiedUtc Milliseconds since epoch.
 */
export function updateRecentFileLastModified(id: string, lastModifiedUtc: number): void {
  const store = loadStore()
  store.files = store.files.map((f) => f.id === id ? {...f, lastModifiedUtc} : f)
  saveStore(store)
}


/**
 * Store the id of the file currently being opened so its model name can be
 * back-filled after the IFC loads.
 *
 * @param id The entry id (fileId for GDrive, filename for local, sharePath for GitHub).
 */
export function setPendingModelNameUpdate(id: string): void {
  try {
    localStorage.setItem(PENDING_MODEL_UPDATE_KEY, id)
  } catch {
    // localStorage may be unavailable
  }
}


/**
 * Read and clear the pending model name update id.
 *
 * @return The pending id, or null if none.
 */
export function consumePendingModelNameUpdate(): string | null {
  try {
    const id = localStorage.getItem(PENDING_MODEL_UPDATE_KEY)
    localStorage.removeItem(PENDING_MODEL_UPDATE_KEY)
    return id
  } catch {
    return null
  }
}
