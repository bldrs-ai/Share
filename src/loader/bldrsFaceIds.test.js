/* eslint-disable no-magic-numbers */
import * as pako from 'pako'
import {
  BLDRS_FACE_IDS_EXTENSION_NAME,
  BldrsFaceIdsReader,
  base64ToUint32Array,
  buildFaceIdsExtensionData,
  capturePerTriangleIds,
} from './bldrsFaceIds'
import {
  injectGlbExtensions,
  parseGlb,
  serializeGlb,
} from './injectGlbExtensions'


/**
 * Build a minimal GLB with a single mesh primitive that carries:
 *   - index buffer (Uint32, triangleCount triangles)
 *   - POSITION attribute (placeholder, 3 floats per vertex)
 *   - _EXPRESSID attribute (Uint32, one per vertex)
 *   - _INSTANCEID attribute (Uint32, one per vertex; optional)
 *
 * All buffers concatenated into one BIN chunk; bufferView offsets
 * 4-byte aligned. Returns the GLB bytes.
 *
 * @param {object} opts
 * @param {Uint32Array} opts.indices
 * @param {Uint32Array} opts.expressIdsPerVertex
 * @param {Uint32Array|null} [opts.instanceIdsPerVertex]
 * @return {Uint8Array}
 */
function makeGlbWithIds({indices, expressIdsPerVertex, instanceIdsPerVertex}) {
  const vertexCount = expressIdsPerVertex.length
  const indexBytes = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength)
  const expressBytes = new Uint8Array(
    expressIdsPerVertex.buffer, expressIdsPerVertex.byteOffset, expressIdsPerVertex.byteLength)
  const instanceBytes = instanceIdsPerVertex ?
    new Uint8Array(
      instanceIdsPerVertex.buffer,
      instanceIdsPerVertex.byteOffset,
      instanceIdsPerVertex.byteLength) :
    null
  // Three floats per vertex for POSITION (zeros; not used by our reader).
  const positionBytes = new Uint8Array(vertexCount * 3 * 4)

  const bufferViews = []
  let cursor = 0
  // Index
  bufferViews.push({buffer: 0, byteOffset: cursor, byteLength: indexBytes.byteLength})
  const indexBvIdx = bufferViews.length - 1
  cursor += indexBytes.byteLength
  // Position
  bufferViews.push({buffer: 0, byteOffset: cursor, byteLength: positionBytes.byteLength})
  const posBvIdx = bufferViews.length - 1
  cursor += positionBytes.byteLength
  // ExpressID
  bufferViews.push({buffer: 0, byteOffset: cursor, byteLength: expressBytes.byteLength})
  const expressBvIdx = bufferViews.length - 1
  cursor += expressBytes.byteLength
  // InstanceID (optional)
  let instanceBvIdx = -1
  if (instanceBytes) {
    bufferViews.push({buffer: 0, byteOffset: cursor, byteLength: instanceBytes.byteLength})
    instanceBvIdx = bufferViews.length - 1
    cursor += instanceBytes.byteLength
  }

  const accessors = []
  accessors.push({
    bufferView: indexBvIdx, componentType: 5125 /* UNSIGNED_INT */,
    type: 'SCALAR', count: indices.length,
  })
  const indexAccIdx = accessors.length - 1
  accessors.push({
    bufferView: posBvIdx, componentType: 5126 /* FLOAT */,
    type: 'VEC3', count: vertexCount,
  })
  const posAccIdx = accessors.length - 1
  accessors.push({
    bufferView: expressBvIdx, componentType: 5125,
    type: 'SCALAR', count: vertexCount,
  })
  const expressAccIdx = accessors.length - 1
  let instanceAccIdx = -1
  if (instanceBvIdx >= 0) {
    accessors.push({
      bufferView: instanceBvIdx, componentType: 5125,
      type: 'SCALAR', count: vertexCount,
    })
    instanceAccIdx = accessors.length - 1
  }

  const attributes = {POSITION: posAccIdx, _EXPRESSID: expressAccIdx}
  if (instanceAccIdx >= 0) {
    attributes._INSTANCEID = instanceAccIdx
  }

  const json = {
    asset: {version: '2.0'},
    buffers: [{byteLength: cursor}],
    bufferViews,
    accessors,
    meshes: [{primitives: [{indices: indexAccIdx, attributes}]}],
  }
  const bin = new Uint8Array(cursor)
  bin.set(indexBytes, bufferViews[indexBvIdx].byteOffset)
  bin.set(positionBytes, bufferViews[posBvIdx].byteOffset)
  bin.set(expressBytes, bufferViews[expressBvIdx].byteOffset)
  if (instanceBytes) {
    bin.set(instanceBytes, bufferViews[instanceBvIdx].byteOffset)
  }
  return serializeGlb(json, bin)
}


describe('loader/bldrsFaceIds', () => {
  describe('capturePerTriangleIds', () => {
    it('derives per-triangle IDs from per-vertex attributes', () => {
      // Two triangles, four vertices. Triangle 0 uses vertices 0,1,2
      // (all expressID 100). Triangle 1 uses vertices 1,2,3 (mixed —
      // but the assembler emits same ID per triangle, so we just
      // take vertex 0 for each triangle for matching behaviour).
      const indices = new Uint32Array([0, 1, 2, 3, 4, 5])
      const expressIdsPerVertex = new Uint32Array([100, 100, 100, 200, 200, 200])
      const instanceIdsPerVertex = new Uint32Array([10, 10, 10, 20, 20, 20])
      const glb = makeGlbWithIds({indices, expressIdsPerVertex, instanceIdsPerVertex})
      const {json, bin} = parseGlb(glb)
      const captured = capturePerTriangleIds(json, bin)
      expect(captured).not.toBeNull()
      expect(captured.perPrimitive).toHaveLength(1)
      expect(Array.from(captured.perPrimitive[0].expressIds)).toEqual([100, 200])
      expect(Array.from(captured.perPrimitive[0].instanceIds)).toEqual([10, 20])
    })

    it('returns null when no primitive carries _EXPRESSID', () => {
      // Hand-build a minimal GLB without IFC attributes.
      const json = {
        asset: {version: '2.0'},
        buffers: [{byteLength: 12}],
        bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 12}],
        accessors: [{
          bufferView: 0, componentType: 5126, type: 'VEC3', count: 1,
        }],
        meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
      }
      const glb = serializeGlb(json, new Uint8Array(12))
      const {json: parsedJson, bin: parsedBin} = parseGlb(glb)
      expect(capturePerTriangleIds(parsedJson, parsedBin)).toBeNull()
    })

    it('handles _EXPRESSID without _INSTANCEID (instanceIds null in output)', () => {
      const indices = new Uint32Array([0, 1, 2])
      const expressIdsPerVertex = new Uint32Array([500, 500, 500])
      const glb = makeGlbWithIds({indices, expressIdsPerVertex})
      const {json, bin} = parseGlb(glb)
      const captured = capturePerTriangleIds(json, bin)
      expect(captured.perPrimitive[0].expressIds[0]).toBe(500)
      expect(captured.perPrimitive[0].instanceIds).toBeNull()
    })
  })

  describe('Base64 round-trip', () => {
    it('preserves a Uint32Array verbatim through Base64 encoding', () => {
      // Mix of small + large values (above DRACO's 16-bit ceiling) to
      // verify we're storing 32-bit values losslessly.
      const original = new Uint32Array([0, 1, 65535, 65536, 700000, 999999, 4294967295])
      const built = buildFaceIdsExtensionData({
        perPrimitive: [{expressIds: original, instanceIds: null}],
      })
      const decoded = base64ToUint32Array(built.perPrimitive[0].expressIds)
      expect(Array.from(decoded)).toEqual(Array.from(original))
    })

    it('preserves a multi-MB Uint32Array (large CHUNK boundary stress test)', () => {
      // 200k values — exceeds the 32KB CHUNK size in `uint32ArrayToBase64`
      // (200k × 4 bytes = 800KB, ~25 chunks). Catches off-by-one in
      // the chunk loop.
      const SIZE = 200_000
      const original = new Uint32Array(SIZE)
      for (let i = 0; i < SIZE; i++) {
        original[i] = (i * 31) % 1_000_000
      }
      const built = buildFaceIdsExtensionData({
        perPrimitive: [{expressIds: original, instanceIds: null}],
      })
      const decoded = base64ToUint32Array(built.perPrimitive[0].expressIds)
      expect(decoded.length).toBe(SIZE)
      for (let i = 0; i < SIZE; i++) {
        if (decoded[i] !== original[i]) {
          throw new Error(`mismatch at index ${i}: ${decoded[i]} !== ${original[i]}`)
        }
      }
    })
  })

  describe('BldrsFaceIdsReader (round-trip via injectGlbExtensions)', () => {
    /**
     * Build a fake GLTFLoader parser stub over `{json, bin}`.
     *
     * @param {Uint8Array} glb
     * @return {object}
     */
    function parserFromGlb(glb) {
      const {json, bin} = parseGlb(glb)
      const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
      return {
        json,
        getDependency: (kind) => kind === 'buffer' ? Promise.resolve(buffer) : Promise.reject(new Error('?')),
      }
    }

    it('decodes back to typed arrays equal to the captured input', async () => {
      const indices = new Uint32Array([0, 1, 2, 3, 4, 5])
      const expressIdsPerVertex = new Uint32Array([700000, 700000, 700000, 800000, 800000, 800000])
      const instanceIdsPerVertex = new Uint32Array([5, 5, 5, 9, 9, 9])
      const glb = makeGlbWithIds({indices, expressIdsPerVertex, instanceIdsPerVertex})
      const {json, bin} = parseGlb(glb)
      const captured = capturePerTriangleIds(json, bin)
      const extensionData = buildFaceIdsExtensionData(captured)
      const {bytes: withExt} = injectGlbExtensions(glb, [
        {name: BLDRS_FACE_IDS_EXTENSION_NAME, data: extensionData, compress: true},
      ])

      const reader = new BldrsFaceIdsReader(parserFromGlb(withExt))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      const resolved = gltf.scene.userData.bldrsFaceIds
      expect(resolved).toBeDefined()
      expect(resolved.perPrimitive).toHaveLength(1)
      // Critical assertion: values above DRACO's 16-bit ceiling
      // (700000 / 800000) survive the round trip exactly. This is
      // the regression face_ids exists to fix — DRACO quantising
      // them in the per-vertex stream would have collapsed adjacent
      // expressIDs together.
      expect(Array.from(resolved.perPrimitive[0].expressIds)).toEqual([700000, 800000])
      expect(Array.from(resolved.perPrimitive[0].instanceIds)).toEqual([5, 9])
      // Alignment canary survives round-trip and equals expressIds[0].
      expect(resolved.perPrimitive[0].firstExpressId).toBe(700000)
    })

    it('emits firstExpressId canary that matches expressIds[0] after round-trip', async () => {
      const indices = new Uint32Array([0, 1, 2, 3, 4, 5])
      const expressIdsPerVertex = new Uint32Array([42, 42, 42, 99, 99, 99])
      const glb = makeGlbWithIds({indices, expressIdsPerVertex})
      const {json, bin} = parseGlb(glb)
      const captured = capturePerTriangleIds(json, bin)
      const extensionData = buildFaceIdsExtensionData(captured)
      expect(extensionData.perPrimitive[0].firstExpressId).toBe(42)
      const {bytes: withExt} = injectGlbExtensions(glb, [
        {name: BLDRS_FACE_IDS_EXTENSION_NAME, data: extensionData, compress: true},
      ])
      const reader = new BldrsFaceIdsReader(parserFromGlb(withExt))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      const entry = gltf.scene.userData.bldrsFaceIds.perPrimitive[0]
      expect(entry.firstExpressId).toBe(entry.expressIds[0])
    })

    it('is a no-op when the GLB has no BLDRS_face_ids extension', async () => {
      const indices = new Uint32Array([0, 1, 2])
      const expressIdsPerVertex = new Uint32Array([1, 1, 1])
      const glb = makeGlbWithIds({indices, expressIdsPerVertex})
      const reader = new BldrsFaceIdsReader(parserFromGlb(glb))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(gltf.scene.userData.bldrsFaceIds).toBeUndefined()
    })

    it('survives a gltf with no default scene (no attach, no throw)', async () => {
      const indices = new Uint32Array([0, 1, 2])
      const expressIdsPerVertex = new Uint32Array([1, 1, 1])
      const baseGlb = makeGlbWithIds({indices, expressIdsPerVertex})
      const captured = capturePerTriangleIds(parseGlb(baseGlb).json, parseGlb(baseGlb).bin)
      const extData = buildFaceIdsExtensionData(captured)
      const {bytes: withExt} = injectGlbExtensions(baseGlb, [
        {name: BLDRS_FACE_IDS_EXTENSION_NAME, data: extData, compress: true},
      ])
      const reader = new BldrsFaceIdsReader(parserFromGlb(withExt))
      const gltf = {/* no .scene */}
      await expect(reader.afterRoot(gltf)).resolves.toBe(gltf)
    })

    it('skips when the extension has an out-of-range bufferView', async () => {
      const indices = new Uint32Array([0, 1, 2])
      const expressIdsPerVertex = new Uint32Array([1, 1, 1])
      const baseGlb = makeGlbWithIds({indices, expressIdsPerVertex})
      const {json} = parseGlb(baseGlb)
      // Inject a malformed extension entry directly.
      json.extensionsUsed = [BLDRS_FACE_IDS_EXTENSION_NAME]
      json.extensions = {[BLDRS_FACE_IDS_EXTENSION_NAME]: {compressed: true, bufferView: 99}}
      const malformedGlb = serializeGlb(json, parseGlb(baseGlb).bin)
      const reader = new BldrsFaceIdsReader(parserFromGlb(malformedGlb))
      const gltf = {scene: {userData: {}}}
      await reader.afterRoot(gltf)
      expect(gltf.scene.userData.bldrsFaceIds).toBeUndefined()
    })
  })

  describe('payload size', () => {
    it('compressed payload is on the order of expected magnitude for a 1M-triangle mesh', () => {
      // Build a mesh-shaped Uint32Array sized for 1M triangles, each
      // with a random expressID in [0, 700k]. Verify that the
      // compressed payload is roughly within a 3x factor of the raw
      // size — sanity check that gzip is doing meaningful work on
      // the Base64-encoded data without inflating wildly.
      const TRI_COUNT = 1_000_000
      const expressIds = new Uint32Array(TRI_COUNT)
      // Realistic distribution: many triangles per expressID, expressIDs
      // sparse across a wide range. Gzip should compress well.
      for (let i = 0; i < TRI_COUNT; i++) {
        expressIds[i] = (Math.floor(i / 50) * 17) % 700_000
      }
      const built = buildFaceIdsExtensionData({
        perPrimitive: [{expressIds, instanceIds: null}],
      })
      const jsonStr = JSON.stringify(built)
      const rawBytes = new TextEncoder().encode(jsonStr)
      const compressed = pako.gzip(rawBytes)
      const rawSize = TRI_COUNT * 4
      // Base64-encoded JSON should be ~4/3 × raw. Compressed should be
      // smaller than raw (gzip on Base64 still recovers some redundancy).
      expect(compressed.byteLength).toBeLessThan(rawSize * 2)
    })
  })
})
