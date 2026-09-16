// The Bldrs container format, both versions it writes.
//
// jsdom has no `CompressionStream`, so `packGlbChunks` takes its
// graceful-degradation branch by default here and produces a **v2**
// container — which is exactly the Safari-before-16.4 path, and is why the
// v2 expectations below are assertions about shipping behaviour rather than
// about history. The `v3` block plants Node's real streams, the same way
// `export/glbGzip.test.js` does, and is the only place v3 bytes exist.
/* eslint-disable no-magic-numbers */
import {
  CompressionStream as NodeCompressionStream,
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web'
import {
  isBldrsGlbContainer,
  packGlbChunks,
  readGlbContainerHeader,
  readGlbContainerJsonExtent,
  readGlbContainerJsonPrefixes,
  unpackGlbContainer,
} from './glbContainer'
import {serializeGlb} from './injectGlbExtensions'


const CONTAINER_HEADER_BYTES = 16
const MODE_BYTE = 12
const CODEC_BYTE = 13
const CODEC_GZIP = 1
// Where a v3 chunk record's three uint32 fields sit, relative to the record.
const RECORD_GLB_LEN = 0
const RECORD_JSON_MEMBER_LEN = 4
const RECORD_BIN_MEMBER_LEN = 8
const RECORD_HEADER_BYTES = 12

// Long runs so deflate has something to find: the point of several
// assertions below is that the stored form is genuinely smaller, and a
// fixture of random bytes would make gzip bigger than its input and turn
// those into assertions that cannot pass for the right reason.
const BIN_BYTES = 8192


/**
 * A GLB with a real JSON chunk and a real, compressible BIN chunk — the
 * shape `packGlbChunks` splits into two gzip members.
 *
 * @param {number} [fill] BIN fill byte, so two fixtures can be told apart
 * @return {Uint8Array}
 */
function glbFixture(fill = 0x5a) {
  const json = {
    asset: {version: '2.0', generator: 'bldrs-test'},
    accessors: [{componentType: 5126, count: 4, type: 'VEC3', bufferView: 0}],
    meshes: [{primitives: [{attributes: {POSITION: 0}}]}],
    nodes: [{mesh: 0}],
    scene: 0,
    scenes: [{nodes: [0]}],
    buffers: [{byteLength: BIN_BYTES}],
    bufferViews: [{buffer: 0, byteOffset: 0, byteLength: 48}],
  }
  return serializeGlb(json, new Uint8Array(BIN_BYTES).fill(fill))
}


/**
 * Bytes that are NOT a packable GLB, with each header word dialable so one
 * of `glbJsonPartLength`'s guards can be defeated at a time.
 *
 * @param {object} [fields]
 * @param {number} [fields.magic] word at offset 0
 * @param {number} [fields.jsonLen] word at offset 12
 * @param {number} [fields.chunkType] word at offset 16
 * @return {Uint8Array}
 */
function junk({magic = 0x07070707, jsonLen = 64, chunkType = 0x07070707} = {}) {
  const out = new Uint8Array(512).fill(7)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, magic, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, chunkType, true)
  return out
}


/**
 * Where the inner GLB's JSON half ends: past the 12-byte GLB header, the
 * 8-byte JSON chunk header and the JSON chunk data.
 *
 * @param {Uint8Array} glb
 * @return {number}
 */
function jsonHalfLength(glb) {
  return 12 + 8 + new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true)
}


describe('loader/glbContainer', () => {
  describe('without a CompressionStream (Safari < 16.4, and jsdom)', () => {
    it('falls back to a v2 container rather than failing the cache write', async () => {
      expect(global.CompressionStream).toBeUndefined()
      const chunk = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3])
      const packed = await packGlbChunks([chunk])
      const header = readGlbContainerHeader(packed)
      expect(header.version).toBe(2)
      expect(header.codec).toBeNull()
      // The v2 record is a bare length prefix, and the payload is verbatim.
      expect(packed.byteLength).toBe(CONTAINER_HEADER_BYTES + 4 + chunk.byteLength)
      expect(Array.from(packed.subarray(CONTAINER_HEADER_BYTES + 4))).toEqual(Array.from(chunk))
    })

    it('round-trips a single chunk', async () => {
      const chunk = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3]) // "glTF" + payload
      const packed = await packGlbChunks([chunk])
      expect(isBldrsGlbContainer(packed)).toBe(true)
      const {chunks, mode, version} = await unpackGlbContainer(packed)
      expect(chunks).toHaveLength(1)
      expect(version).toBe(2)
      expect(mode).toBeNull()
      expect(Array.from(new Uint8Array(chunks[0]))).toEqual(Array.from(chunk))
    })

    it('round-trips multiple chunks in order', async () => {
      const a = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xaa])
      const b = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xbb, 0xcc])
      const c = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xdd, 0xee, 0xff])
      const packed = await packGlbChunks([a, b, c])
      const {chunks} = await unpackGlbContainer(packed)
      expect(chunks.map((ab) => Array.from(new Uint8Array(ab)))).toEqual([
        Array.from(a),
        Array.from(b),
        Array.from(c),
      ])
    })

    it('records the compression mode in the header and round-trips it', async () => {
      const chunk = new Uint8Array([0x67, 0x6c, 0x54, 0x46])
      expect((await unpackGlbContainer(await packGlbChunks([chunk], 'draco'))).mode).toBe('draco')
      expect((await unpackGlbContainer(await packGlbChunks([chunk], 'meshopt'))).mode).toBe('meshopt')
      expect((await unpackGlbContainer(await packGlbChunks([chunk], null))).mode).toBeNull()
    })

    it('reports chunk 0 as its own JSON extent, uncompressed', async () => {
      const glb = glbFixture()
      const packed = await packGlbChunks([glb])
      const extent = readGlbContainerJsonExtent(packed.subarray(0, 64))
      expect(extent.isCompressed).toBe(false)
      expect(extent.glbByteLength).toBe(glb.byteLength)
      // The GLB sits at the container header + the 4-byte length prefix, and
      // the extent stops at the end of its JSON chunk — it must not reach
      // BIN even when BIN is right there on disk.
      expect(extent.jsonStart).toBe(CONTAINER_HEADER_BYTES + 4)
      expect(extent.jsonStoredBytes).toBe(jsonHalfLength(glb))
      expect(extent.jsonStoredBytes).toBeLessThan(glb.byteLength)
    })
  })

  describe('v3, with real streams', () => {
    beforeAll(() => {
      global.CompressionStream = NodeCompressionStream
      global.DecompressionStream = NodeDecompressionStream
    })

    afterAll(() => {
      delete global.CompressionStream
      delete global.DecompressionStream
    })

    it('stores a v3 container that round-trips byte-identically, smaller', async () => {
      const glb = glbFixture()
      const packed = await packGlbChunks([glb])
      const header = readGlbContainerHeader(packed)
      expect(header.version).toBe(3)
      expect(header.codec).toBe('gzip')
      expect(packed.byteLength).toBeLessThan(glb.byteLength)
      const {chunks, version} = await unpackGlbContainer(packed)
      expect(version).toBe(3)
      expect(new Uint8Array(chunks[0])).toEqual(glb)
    })

    it('splits each chunk into a JSON member and a BIN member', async () => {
      const glb = glbFixture()
      const packed = await packGlbChunks([glb])
      const dv = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
      const record = CONTAINER_HEADER_BYTES
      expect(dv.getUint32(record + RECORD_GLB_LEN, true)).toBe(glb.byteLength)
      const jsonMemberLen = dv.getUint32(record + RECORD_JSON_MEMBER_LEN, true)
      const binMemberLen = dv.getUint32(record + RECORD_BIN_MEMBER_LEN, true)
      // Two members, both non-empty, and together they are the whole payload:
      // a single-member container would store one of these as zero.
      expect(jsonMemberLen).toBeGreaterThan(0)
      expect(binMemberLen).toBeGreaterThan(0)
      expect(packed.byteLength)
        .toBe(CONTAINER_HEADER_BYTES + RECORD_HEADER_BYTES + jsonMemberLen + binMemberLen)
    })

    it('keeps the container codec OFF the mode byte', async () => {
      // `Loader.js#tryLoadCachedGlb` misses whenever the header's mode is not
      // what `activeGlbCompressionMode()` asked for, so a container codec
      // written into byte 12 would false-miss forever. The codec has byte 13.
      const glb = glbFixture()
      for (const [mode, modeByte] of [[null, 0], ['draco', 1], ['meshopt', 2]]) {
        const packed = await packGlbChunks([glb], mode)
        expect(packed[MODE_BYTE]).toBe(modeByte)
        expect(packed[CODEC_BYTE]).toBe(CODEC_GZIP)
        expect(readGlbContainerHeader(packed).mode).toBe(mode)
        expect((await unpackGlbContainer(packed)).mode).toBe(mode)
      }
    })

    it('answers the size question without reading BIN at all', async () => {
      const glb = glbFixture()
      const packed = await packGlbChunks([glb])
      const extent = readGlbContainerJsonExtent(packed.subarray(0, 64))
      expect(extent.isCompressed).toBe(true)
      expect(extent.glbByteLength).toBe(glb.byteLength)
      expect(extent.jsonStart).toBe(CONTAINER_HEADER_BYTES + RECORD_HEADER_BYTES)

      // Destroy every byte the extent does NOT name. If the JSON read
      // touched the BIN member — or if a whole-file gzip had been used —
      // this could not inflate.
      const poisoned = new Uint8Array(packed)
      poisoned.fill(0xab, extent.jsonStart + extent.jsonStoredBytes)
      const {prefixes} = await readGlbContainerJsonPrefixes(poisoned)
      expect(prefixes).toHaveLength(1)
      expect(prefixes[0]).toEqual(glb.subarray(0, jsonHalfLength(glb)))

      // And the poisoning really was destructive: a full unpack of the same
      // bytes must fail, or the assertion above proved nothing.
      await expect(unpackGlbContainer(poisoned)).rejects.toThrow()
    })

    it('inflates only the JSON half for a prefix read', async () => {
      const glb = glbFixture()
      const {prefixes} = await readGlbContainerJsonPrefixes(await packGlbChunks([glb]))
      expect(prefixes[0].byteLength).toBe(jsonHalfLength(glb))
      expect(prefixes[0].byteLength).toBeLessThan(glb.byteLength)
    })

    it('stores a BIN-less GLB as a single member and still round-trips it', async () => {
      const glb = serializeGlb({asset: {version: '2.0'}, scenes: [{}]}, null)
      const packed = await packGlbChunks([glb])
      const dv = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
      expect(dv.getUint32(CONTAINER_HEADER_BYTES + RECORD_BIN_MEMBER_LEN, true)).toBe(0)
      const {chunks} = await unpackGlbContainer(packed)
      expect(new Uint8Array(chunks[0])).toEqual(glb)
    })

    it.each([
      ['arbitrary junk', junk()],
      ['a JSON chunk type under the wrong magic', junk({magic: 0x12345678, chunkType: 0x4E4F534A})],
      ['the right magic over a non-JSON first chunk', junk({magic: 0x46546C67, chunkType: 0x004E4942})],
      ['a JSON chunk longer than the bytes', junk({magic: 0x46546C67, chunkType: 0x4E4F534A, jsonLen: 99999})],
    ])('stores %s as a single member, rather than refusing', async (_label, bytes) => {
      // Refusing would cost the whole cache entry, and the size path's random
      // access is worth nothing on an artifact nothing can parse anyway. Each
      // row defeats exactly one of `glbJsonPartLength`'s guards, so a guard
      // that stopped checking would split at a boundary it invented.
      const packed = await packGlbChunks([bytes])
      const dv = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
      expect(dv.getUint32(CONTAINER_HEADER_BYTES + RECORD_BIN_MEMBER_LEN, true)).toBe(0)
      const {chunks} = await unpackGlbContainer(packed)
      expect(new Uint8Array(chunks[0])).toEqual(bytes)
    })

    it('round-trips multiple chunks in order', async () => {
      const a = glbFixture(0x01)
      const b = glbFixture(0x02)
      const {chunks} = await unpackGlbContainer(await packGlbChunks([a, b]))
      expect(chunks.map((ab) => new Uint8Array(ab))).toEqual([a, b])
    })

    it('refuses a chunk whose declared length disagrees with its payload', async () => {
      // The declared length is what `artifactSizesFromFile` reports WITHOUT
      // inflating anything, so a header that lies must fail the load rather
      // than feed the Export tab a wrong figure.
      const packed = await packGlbChunks([glbFixture()])
      new DataView(packed.buffer).setUint32(CONTAINER_HEADER_BYTES + RECORD_GLB_LEN, 999, true)
      await expect(unpackGlbContainer(packed)).rejects.toThrow(/header declares 999B/)
    })

    it('rejects an unknown container codec instead of guessing', async () => {
      const packed = await packGlbChunks([glbFixture()])
      packed[CODEC_BYTE] = 9
      expect(() => readGlbContainerHeader(packed)).toThrow(/unsupported container codec 9/)
    })

    it('still reads a v2 container written before the codec existed', async () => {
      // The whole backward-compatibility claim: the reader must serve an
      // uncompressed artifact in place, because nothing sweeps the OPFS slot
      // a schema bump would retire.
      delete global.CompressionStream
      const glb = glbFixture()
      const v2 = await packGlbChunks([glb], 'draco')
      global.CompressionStream = NodeCompressionStream
      expect(readGlbContainerHeader(v2).version).toBe(2)
      const {chunks, mode, version} = await unpackGlbContainer(v2)
      expect(version).toBe(2)
      expect(mode).toBe('draco')
      expect(new Uint8Array(chunks[0])).toEqual(glb)
      const {prefixes} = await readGlbContainerJsonPrefixes(v2)
      expect(prefixes[0]).toEqual(glb.subarray(0, jsonHalfLength(glb)))
    })
  })

  it('reads v1 containers (no mode byte) as mode=null', async () => {
    // Hand-build a v1 container: 12-byte header, no mode byte.
    const chunk = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0xab])
    const buf = new Uint8Array(12 + 4 + chunk.length)
    buf[0] = 0x42; buf[1] = 0x4C; buf[2] = 0x44; buf[3] = 0x52
    const dv = new DataView(buf.buffer)
    dv.setUint32(4, 1, true) // version=1
    dv.setUint32(8, 1, true) // chunkCount=1
    dv.setUint32(12, chunk.length, true) // chunkLen
    buf.set(chunk, 16)
    const {chunks, mode, version} = await unpackGlbContainer(buf)
    expect(version).toBe(1)
    expect(mode).toBeNull()
    expect(chunks).toHaveLength(1)
    expect(new Uint8Array(chunks[0])).toEqual(chunk)
  })

  it('isBldrsGlbContainer returns false for a bare GLB', () => {
    const bareGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(isBldrsGlbContainer(bareGlb)).toBe(false)
  })

  it('isBldrsGlbContainer returns false for too-short input', () => {
    expect(isBldrsGlbContainer(new Uint8Array(8))).toBe(false)
    expect(isBldrsGlbContainer(null)).toBe(false)
  })

  it('packGlbChunks throws on empty input', async () => {
    await expect(packGlbChunks([])).rejects.toThrow(/at least one chunk/)
  })

  it('unpackGlbContainer throws on missing magic', async () => {
    const fake = new Uint8Array(16)
    await expect(unpackGlbContainer(fake)).rejects.toThrow(/BLDR magic/)
  })

  it('unpackGlbContainer throws on truncated chunk', async () => {
    // Build a v2 container that claims 1 chunk of 100 bytes but only contains 5.
    const buf = new Uint8Array(16 + 4 + 5)
    buf[0] = 0x42; buf[1] = 0x4C; buf[2] = 0x44; buf[3] = 0x52
    const dv = new DataView(buf.buffer)
    dv.setUint32(4, 2, true) // version=2
    dv.setUint32(8, 1, true) // chunkCount=1
    buf[12] = 0 // mode=none
    dv.setUint32(16, 100, true) // chunkLen (lies)
    await expect(unpackGlbContainer(buf)).rejects.toThrow(/truncated/)
  })

  it('rejects an unsupported container version', async () => {
    const buf = new Uint8Array(16 + 4)
    buf[0] = 0x42; buf[1] = 0x4C; buf[2] = 0x44; buf[3] = 0x52
    new DataView(buf.buffer).setUint32(4, 99, true)
    await expect(unpackGlbContainer(buf)).rejects.toThrow(/unsupported version 99/)
  })

  it('produces ArrayBuffers of exactly chunk-length', async () => {
    const chunk = new Uint8Array(50)
    const packed = await packGlbChunks([chunk])
    const {chunks} = await unpackGlbContainer(packed)
    expect(chunks[0].byteLength).toBe(50)
    expect(chunks[0]).toBeInstanceOf(ArrayBuffer)
  })
})
