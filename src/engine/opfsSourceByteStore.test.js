/* eslint-disable no-magic-numbers */
// Tests for the OPFS-backed source byte store + the post-writer spill
// step (design/new/lazy-properties-memory.md step 3).
import {makeBlobByteStore} from './opfsSourceByteStore'


/**
 * Build content-checkable bytes 0..n-1 mod 256 wrapped in a Blob.
 *
 * @param {number} count byte count
 * @return {object} `{blob, bytes}`
 */
function makeBlob(count) {
  const bytes = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    bytes[i] = i % 256
  }
  return {blob: new Blob([bytes]), bytes}
}


describe('engine/opfsSourceByteStore', () => {
  describe('makeBlobByteStore', () => {
    it('exposes the blob size as byteLength', () => {
      const {blob} = makeBlob(300)
      expect(makeBlobByteStore(blob).byteLength).toBe(300)
    })

    it('reads exact byte ranges as standalone Uint8Arrays', async () => {
      const {blob, bytes} = makeBlob(300)
      const store = makeBlobByteStore(blob)
      const mid = await store.read(100, 50)
      expect(mid).toBeInstanceOf(Uint8Array)
      // Conway's extraction layer assumes standalone views (byteOffset 0).
      expect(mid.byteOffset).toBe(0)
      expect(mid.byteLength).toBe(50)
      expect(Array.from(mid)).toEqual(Array.from(bytes.subarray(100, 150)))
    })

    it('reads the final range up to EOF', async () => {
      const {blob, bytes} = makeBlob(300)
      const store = makeBlobByteStore(blob)
      const tail = await store.read(290, 10)
      expect(Array.from(tail)).toEqual(Array.from(bytes.subarray(290, 300)))
    })
  })
})
