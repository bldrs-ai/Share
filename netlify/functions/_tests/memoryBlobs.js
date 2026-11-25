/*
 * An in-memory stand-in for a @netlify/blobs store, for unit tests of code
 * that lists and deletes as well as gets and sets (_lib/accountUsage.js,
 * account-usage-stats, account-usage-retention). fakeBlobs.js stands in for
 * the HTTP API under the real client, which is what the ledger's conditional
 * writes need; this one is the store's own surface, which is all these need.
 * `onlyIfNew` is honoured (`modified: false` when the key exists), as the
 * service does.
 */


/**
 * @param {object} [initial] key → value (objects are stored as JSON)
 * @return {object} a store with get/set/delete/list, and `data` to inspect
 */
export function createMemoryBlobs(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  return {
    data,
    get: jest.fn((key, {type} = {}) => {
      if (!data.has(key)) {
        return Promise.resolve(null)
      }
      return Promise.resolve(type === 'json' ? JSON.parse(data.get(key)) : data.get(key))
    }),
    set: jest.fn((key, value, {onlyIfNew} = {}) => {
      if (onlyIfNew && data.has(key)) {
        return Promise.resolve({modified: false})
      }
      data.set(key, String(value))
      return Promise.resolve({modified: true, etag: '"m"'})
    }),
    delete: jest.fn((key) => {
      data.delete(key)
      return Promise.resolve()
    }),
    // `directories: true` answers as the service does: the keys directly
    // under the prefix as blobs, and each deeper level's first segment, once,
    // as a directory (without a trailing slash).
    list: jest.fn(({prefix = '', directories = false} = {}) => {
      const keys = [...data.keys()].filter((k) => k.startsWith(prefix))
      if (!directories) {
        return Promise.resolve({blobs: keys.map((key) => ({key, etag: '"m"'})), directories: []})
      }
      const dirs = new Set()
      const blobs = []
      for (const key of keys) {
        const rest = key.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash === -1) {
          blobs.push({key, etag: '"m"'})
        } else {
          dirs.add(prefix + rest.slice(0, slash))
        }
      }
      return Promise.resolve({blobs, directories: [...dirs]})
    }),
  }
}
