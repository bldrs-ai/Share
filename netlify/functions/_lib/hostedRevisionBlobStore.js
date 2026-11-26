/**
 * Adapt a private, strongly consistent Netlify Blobs store to the revision
 * resolver. The caller supplies the store so tests can use the SDK without
 * creating a site store or exposing HTTP routes.
 *
 * @param {object} blobs Netlify Blobs store
 * @return {object} Digest-keyed read and create-if-absent operations
 */
export function hostedRevisionBlobStore(blobs) {
  return {
    get: (key) => blobs.get(key, {type: 'json'}),
    async insert(key, record) {
      // setJSON in the pinned SDK drops conditional-write options. Use the
      // same set() form as aiLedger.js to send If-None-Match: *.
      const result = await blobs.set(key, JSON.stringify(record), {onlyIfNew: true})
      return result.modified
    },
  }
}
