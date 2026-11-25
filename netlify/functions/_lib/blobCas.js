/*
 * Read-modify-write one Netlify Blobs key under compare-and-swap: read the
 * record and its ETag with strong consistency, change it, and write it back
 * conditional on the ETag (`onlyIfMatch`), or, for a record that doesn't
 * exist yet, on it still not existing (`onlyIfNew`). Netlify Blobs sends
 * those as `If-Match: <etag>` / `If-None-Match: *` and answers 412 when
 * another write got there first, which @netlify/blobs reports as
 * `{modified: false}`; this then re-reads and tries again.
 *
 * Shared by the AI relay's credit ledger (`aiLedger.js`, where the reasons
 * for it are written up) and the anonymous metering ledger
 * (`meterLedger.js`).
 *
 * ## The @netlify/blobs 10.7.4 trap
 *
 * `store.setJSON(key, value, {onlyIfMatch})` does NOT send the condition in
 * 10.7.4: it spreads the conditions into the request options instead of
 * passing them as `conditions`, so no `If-Match` goes out, the write lands
 * unconditionally, and the result still says `modified: true`. Only
 * `store.set()` passes them through. So every write here is
 * `set(key, JSON.stringify(record), {onlyIfMatch | onlyIfNew})`, and
 * `_tests/aiLedger.test.js` pins that the header reaches the wire.
 */


// Retries before giving up with 'contention'. With jitter, six attempts span
// roughly a second, under any one request's patience; a key that loses six
// in a row is a hot key, which is a sharding problem to fix, not to wait out.
export const CAS_ATTEMPTS = 6
const CAS_BACKOFF_BASE_MS = 15
const CAS_BACKOFF_JITTER_MS = 60


/**
 * @param {object} store a @netlify/blobs Store (or anything with the same
 *   `getWithMetadata` / `set` contract)
 * @param {string} key
 * @param {object} options
 * @param {function(*): object} options.normalize what the store held → a well-formed record
 * @param {function(object): *} options.change `(record) => result`; mutates the record to write
 *   it, or returns `{write: false, ...}` to leave the store alone
 * @param {function(string, ?Error): Error} options.fail builds the error to throw, from a reason
 *   ('store' or 'contention') and the store's error, if any
 * @return {Promise<*>} what `change` returned on the attempt that stuck
 */
export async function compareAndSwap(store, key, {normalize, change, fail}) {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    let current
    try {
      current = await store.getWithMetadata(key, {type: 'json', consistency: 'strong'})
    } catch (err) {
      throw fail('store', err)
    }
    const record = normalize(current?.data)
    const result = change(record)
    if (result && result.write === false) {
      return result
    }
    let written
    try {
      // set(), never setJSON(): see the header. `current.etag` can be
      // undefined only for a record that doesn't exist.
      written = await store.set(key, JSON.stringify(record),
        current && current.etag ? {onlyIfMatch: current.etag} : {onlyIfNew: true})
    } catch (err) {
      throw fail('store', err)
    }
    if (written.modified) {
      return result
    }
    await new Promise((resolve) => {
      setTimeout(resolve, (CAS_BACKOFF_BASE_MS * (attempt + 1)) + Math.floor(Math.random() * CAS_BACKOFF_JITTER_MS))
    })
  }
  throw fail('contention', null)
}
