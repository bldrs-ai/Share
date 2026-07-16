/* eslint-disable no-magic-numbers */
// Tests for the OPFS-backed source byte store + the post-writer spill
// step (design/new/lazy-properties-memory.md step 3).
import {makeBlobByteStore, spillModelSource} from './opfsSourceByteStore'


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


describe('loader/opfsSourceByteStore', () => {
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

  describe('spillModelSource', () => {
    /**
     * Conway IfcAPI stub with the 1.374 spill surface.
     *
     * @param {object} [opts] `{isOpen, spillImpl}`
     * @return {object} the stub
     */
    function makeIfcAPI({isOpen = true, spillImpl} = {}) {
      return {
        IsModelOpen: jest.fn(() => isOpen),
        SpillModelSource: jest.fn(spillImpl ?? (() => true)),
      }
    }

    it('spills through the API with a store over the source blob', () => {
      const {blob} = makeBlob(64)
      const ifcAPI = makeIfcAPI()
      expect(spillModelSource(ifcAPI, 0, blob)).toBe(true)
      expect(ifcAPI.IsModelOpen).toHaveBeenCalledWith(0)
      expect(ifcAPI.SpillModelSource).toHaveBeenCalledTimes(1)
      const [modelID, store] = ifcAPI.SpillModelSource.mock.calls[0]
      expect(modelID).toBe(0)
      // The store hands Conway the blob's exact size — Conway rejects a
      // mismatch against the parsed source before mutating any state.
      expect(store.byteLength).toBe(64)
      expect(typeof store.read).toBe('function')
    })

    it('is a silent no-op without a source blob', () => {
      expect(spillModelSource(makeIfcAPI(), 0, null)).toBe(false)
      expect(spillModelSource(makeIfcAPI(), 0, undefined)).toBe(false)
    })

    it('is a silent no-op on APIs without the spill surface (conway <1.374, non-Conway)', () => {
      const {blob} = makeBlob(64)
      expect(spillModelSource(null, 0, blob)).toBe(false)
      expect(spillModelSource(undefined, 0, blob)).toBe(false)
      expect(spillModelSource({}, 0, blob)).toBe(false)
      // IsModelOpen missing entirely (defensive: never call SpillModelSource blind).
      expect(spillModelSource({SpillModelSource: jest.fn()}, 0, blob)).toBe(false)
    })

    it('skips when the model is not open (cache-hit GLB session, already closed)', () => {
      const {blob} = makeBlob(64)
      const ifcAPI = makeIfcAPI({isOpen: false})
      expect(spillModelSource(ifcAPI, 0, blob)).toBe(false)
      expect(ifcAPI.SpillModelSource).not.toHaveBeenCalled()
    })

    it('fails soft when Conway rejects the spill (e.g. byteLength mismatch)', () => {
      const {blob} = makeBlob(64)
      const ifcAPI = makeIfcAPI({
        spillImpl: () => {
          throw new Error('External store byteLength 64 does not match source byteLength 65')
        },
      })
      expect(spillModelSource(ifcAPI, 0, blob)).toBe(false)
    })

    it('returns false when the API declines (SpillModelSource → false)', () => {
      const {blob} = makeBlob(64)
      const ifcAPI = makeIfcAPI({spillImpl: () => false})
      expect(spillModelSource(ifcAPI, 0, blob)).toBe(false)
    })
  })
})
