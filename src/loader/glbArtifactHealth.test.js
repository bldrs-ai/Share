import {packGlbChunks, readGlbContainerJsonPrefixes} from './glbContainer'
import {serializeGlb} from './injectGlbExtensions'
import {
  cachedGlbHasRenderableGeometry,
  glbChunksHaveRenderableGeometry,
  sceneHasRenderableGeometry,
} from './glbArtifactHealth'


// A BIN chunk big enough that a prefix read is visibly shorter than the
// whole GLB, with a fill byte distinct from anything the JSON encodes.
const BIN_BYTES = 64
const BIN_FILL = 0xee


/**
 * Pack a JSON-only glTF document as a Bldrs container.
 *
 * @param {object} json
 * @return {Promise<Uint8Array>}
 */
function packedFromJson(json) {
  return packGlbChunks([serializeGlb(json, null)])
}


describe('glbArtifactHealth', () => {
  describe('sceneHasRenderableGeometry', () => {
    it('returns false for nullish', () => {
      expect(sceneHasRenderableGeometry(null)).toBe(false)
      expect(sceneHasRenderableGeometry(undefined)).toBe(false)
    })

    it('returns true for stubs without traverse (writer unit tests)', () => {
      expect(sceneHasRenderableGeometry({fake: 'model'})).toBe(true)
    })

    it('returns false for a traversed scene with no POSITION vertices', () => {
      const empty = {
        traverse: (fn) => {
          fn({isMesh: true, geometry: {attributes: {position: {count: 0}}}})
          fn({isMesh: false})
        },
      }
      expect(sceneHasRenderableGeometry(empty)).toBe(false)
    })

    it('returns true when any mesh carries vertices', () => {
      const scene = {
        traverse: (fn) => {
          fn({isMesh: true, geometry: {attributes: {position: {count: 3}}}})
        },
      }
      expect(sceneHasRenderableGeometry(scene)).toBe(true)
    })
  })


  describe('cachedGlbHasRenderableGeometry', () => {
    it('returns false for an empty meshes array', async () => {
      const packed = await packedFromJson({asset: {version: '2.0'}, meshes: []})
      expect(await cachedGlbHasRenderableGeometry(packed)).toBe(false)
    })

    it('returns false for a mesh whose primitives have no POSITION', async () => {
      const packed = await packedFromJson({
        asset: {version: '2.0'},
        meshes: [{primitives: [{attributes: {}}]}],
      })
      expect(await cachedGlbHasRenderableGeometry(packed)).toBe(false)
    })

    it('returns false when POSITION points at a zero-count accessor', async () => {
      const packed = await packedFromJson({
        asset: {version: '2.0'},
        accessors: [{count: 0}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      })
      expect(await cachedGlbHasRenderableGeometry(packed)).toBe(false)
    })

    it('returns true when POSITION points at an accessor with vertices', async () => {
      const packed = await packedFromJson({
        asset: {version: '2.0'},
        accessors: [{count: 3}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      })
      expect(await cachedGlbHasRenderableGeometry(packed)).toBe(true)
    })

    it('returns false for bytes that are not a Bldrs container', async () => {
      expect(await cachedGlbHasRenderableGeometry(new Uint8Array([1, 2, 3]))).toBe(false)
    })

    it('answers from each chunk\'s JSON half alone, never its BIN chunk', async () => {
      // The claim that makes the v3 container affordable on the cache-hit
      // path: `glbChunksHaveRenderableGeometry` is given JSON prefixes, not
      // whole GLBs, and still decides correctly (`glbContainer.js` module
      // doc). Under jsdom there is no `CompressionStream`, so these are
      // views over the packed buffer rather than inflated copies.
      const glb = serializeGlb({
        asset: {version: '2.0'},
        accessors: [{count: 3}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
        buffers: [{byteLength: BIN_BYTES}],
      }, new Uint8Array(BIN_BYTES).fill(BIN_FILL))
      const packed = await packGlbChunks([glb])
      const {prefixes} = await readGlbContainerJsonPrefixes(packed)
      expect(prefixes).toHaveLength(1)
      expect(prefixes[0].buffer).toBe(packed.buffer)
      expect(prefixes[0].byteLength).toBeLessThan(glb.byteLength)
      expect(glbChunksHaveRenderableGeometry(prefixes)).toBe(true)
    })
  })
})
