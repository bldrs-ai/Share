import {packGlbChunks, viewGlbContainerChunks} from './glbContainer'
import {serializeGlb} from './injectGlbExtensions'
import {
  cachedGlbHasRenderableGeometry,
  glbChunksHaveRenderableGeometry,
  sceneHasRenderableGeometry,
} from './glbArtifactHealth'


/**
 * Pack a JSON-only glTF document as a Bldrs container.
 *
 * @param {object} json
 * @return {Uint8Array}
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
    it('returns false for an empty meshes array', () => {
      const packed = packedFromJson({asset: {version: '2.0'}, meshes: []})
      expect(cachedGlbHasRenderableGeometry(packed)).toBe(false)
    })

    it('returns false for a mesh whose primitives have no POSITION', () => {
      const packed = packedFromJson({
        asset: {version: '2.0'},
        meshes: [{primitives: [{attributes: {}}]}],
      })
      expect(cachedGlbHasRenderableGeometry(packed)).toBe(false)
    })

    it('returns false when POSITION points at a zero-count accessor', () => {
      const packed = packedFromJson({
        asset: {version: '2.0'},
        accessors: [{count: 0}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      })
      expect(cachedGlbHasRenderableGeometry(packed)).toBe(false)
    })

    it('returns true when POSITION points at an accessor with vertices', () => {
      const packed = packedFromJson({
        asset: {version: '2.0'},
        accessors: [{count: 3}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      })
      expect(cachedGlbHasRenderableGeometry(packed)).toBe(true)
    })

    it('returns false for bytes that are not a Bldrs container', () => {
      expect(cachedGlbHasRenderableGeometry(new Uint8Array([1, 2, 3]))).toBe(false)
    })

    it('inspects inner GLBs as views over the packed buffer, not copies', () => {
      const packed = packedFromJson({
        asset: {version: '2.0'},
        accessors: [{count: 3}],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      })
      const {chunks} = viewGlbContainerChunks(packed)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].buffer).toBe(packed.buffer)
      expect(glbChunksHaveRenderableGeometry(chunks)).toBe(true)
    })
  })
})
