import debug from '../../utils/debug'


const DB_NAME = 'bldrs-terrain'
const DB_VERSION = 1
const STORE_NAME = 'tiles'
const REGISTRY_KEY = 'bldrs-terrain-cache'


/**
 * Open the IndexedDB database for terrain tile caching.
 *
 * @return {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {keyPath: 'key'})
      }
    }
    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = (event) => reject(event.target.error)
  })
}


/**
 * Get a cached terrain tile by key.
 *
 * @param {string} tileKey - e.g. "2683-1248"
 * @return {Promise<ArrayBuffer|null>}
 */
export async function getCachedTile(tileKey) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(tileKey)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.data : null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (e) {
    debug().log('TileCache: Error reading tile', tileKey, e)
    return null
  }
}


/**
 * Store a terrain tile in the cache.
 *
 * @param {string} tileKey - e.g. "2683-1248"
 * @param {ArrayBuffer} arrayBuffer - Raw GeoTIFF data
 */
export async function cacheTile(tileKey, arrayBuffer) {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put({
        key: tileKey,
        data: arrayBuffer,
        downloadedAt: Date.now(),
        sizeBytes: arrayBuffer.byteLength,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    // Update localStorage registry for quick lookup
    updateRegistry(tileKey, arrayBuffer.byteLength)
  } catch (e) {
    debug().log('TileCache: Error caching tile', tileKey, e)
  }
}


/**
 * Get the cache inventory from localStorage (fast, no IndexedDB open needed).
 *
 * @return {Object} Map of tileKey → { sizeBytes, downloadedAt }
 */
export function getCacheInventory() {
  try {
    const stored = localStorage.getItem(REGISTRY_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}


/**
 * Check if a tile is cached.
 *
 * @param {string} tileKey
 * @return {boolean}
 */
export function isTileCached(tileKey) {
  const inventory = getCacheInventory()
  return tileKey in inventory
}


/**
 * Clear all cached terrain tiles.
 */
export async function clearCache() {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    localStorage.removeItem(REGISTRY_KEY)
  } catch (e) {
    debug().log('TileCache: Error clearing cache', e)
  }
}


/**
 * Update the localStorage registry after caching a tile.
 */
function updateRegistry(tileKey, sizeBytes) {
  try {
    const inventory = getCacheInventory()
    inventory[tileKey] = {sizeBytes, downloadedAt: Date.now()}
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(inventory))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}
