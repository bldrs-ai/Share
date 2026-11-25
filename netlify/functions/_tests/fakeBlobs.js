/*
 * A stand-in for the Netlify Blobs HTTP API, for the REAL @netlify/blobs
 * client to talk to (its `fetch` option). It implements exactly the contract
 * the ledgers rely on (`_lib/aiLedger.js`, `_lib/meterLedger.js`): GET
 * answers the value with an ETag or 404; PUT honours `If-Match: <etag>` and
 * `If-None-Match: *`, answering 412 when the condition fails, and a fresh
 * ETag when it writes; DELETE removes a key; a GET of the store itself is
 * `store.list({prefix})`, one page.
 * Each request is handled in one synchronous step after a scheduled delay, so
 * the check-and-write is atomic the way the real service promises, while the
 * delay lets concurrent callers interleave their reads before their writes.
 *
 * So a ledger test that races two reservations through this goes through the
 * same request/response path, headers and all, as production does; only the
 * server is ours. Exposes `requests` for assertions on what went over the
 * wire.
 */
import {getStore} from '@netlify/blobs'


/**
 * @param {object} [options]
 * @param {number} [options.delayMs] per-request latency, so concurrent calls interleave
 * @param {string} [options.name] the store's name
 * @return {{store: object, fetch: Function, requests: Array<object>, data: Map<string, object>}}
 */
export function createFakeBlobs({delayMs = 5, name = 'ai-ledger'} = {}) {
  const data = new Map()
  const requests = []
  let version = 0
  const fakeFetch = (url, init = {}) => new Promise((resolve) => {
    const method = (init.method || 'GET').toUpperCase()
    const headers = new Headers(init.headers || {})
    const key = new URL(url).pathname
    const record = {method, key, ifMatch: headers.get('if-match'), ifNoneMatch: headers.get('if-none-match')}
    requests.push(record)
    setTimeout(() => {
      const current = data.get(key)
      const listing = method === 'GET' && /^\/[^/]+\/[^/]+$/.test(key)
      if (listing) {
        // store.list(): the keys under this store, filtered by `prefix`.
        const prefix = new URL(url).searchParams.get('prefix') ?? ''
        const blobs = [...data.entries()]
          .filter(([path]) => path.startsWith(`${key}/`))
          .map(([path, value]) => ({key: path.slice(key.length + 1), etag: value.etag, size: value.body.length,
            last_modified: '2026-11-25T00:00:00.000Z'}))
          .filter((blob) => blob.key.startsWith(prefix))
        resolve(new Response(JSON.stringify({blobs, directories: []}), {status: 200,
          headers: {'content-type': 'application/json'}}))
        return
      }
      if (method === 'DELETE') {
        data.delete(key)
        record.status = 204
        resolve(new Response(null, {status: 204}))
        return
      }
      if (method === 'GET') {
        resolve(current ?
          new Response(current.body, {status: 200, headers: {'etag': current.etag, 'content-type': 'application/json'}}) :
          new Response(null, {status: 404}))
        return
      }
      if (method === 'PUT') {
        if (record.ifNoneMatch === '*' && current) {
          record.status = 412
          resolve(new Response(null, {status: 412}))
          return
        }
        if (record.ifMatch && (!current || current.etag !== record.ifMatch)) {
          record.status = 412
          resolve(new Response(null, {status: 412}))
          return
        }
        const etag = `"v${++version}"`
        data.set(key, {body: String(init.body), etag})
        record.status = 200
        resolve(new Response(null, {status: 200, headers: {etag}}))
        return
      }
      resolve(new Response(null, {status: 405}))
    }, delayMs)
  })
  const store = getStore({
    name,
    siteID: 'test-site',
    token: 'test-token',
    edgeURL: 'https://blobs.test',
    uncachedEdgeURL: 'https://blobs-uncached.test',
    consistency: 'strong',
    fetch: fakeFetch,
  })
  return {store, fetch: fakeFetch, requests, data}
}


/**
 * @param {object} fake createFakeBlobs's
 * @param {string} key a ledger key, e.g. 'ai/anonymous/x'
 * @return {object|null} the stored record, parsed
 */
export function storedRecord(fake, key) {
  for (const [path, value] of fake.data) {
    if (path.endsWith(`/${key}`)) {
      return JSON.parse(value.body)
    }
  }
  return null
}
