// The MetaStream decoder against what Viewpoint's own Mts3Reader.dll decodes
// from the same bytes (design/new/adf-mts-decoder.md §4). The DLL can't run
// here, so its results for all 54 meshes in PM.adf were recorded once with
// tools/adf-mts/oracle.py and are checked in as hashes.
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {asList, i32, parseADF} from '../adf/adf-parser'
import {AdaptiveModel, ArithDecoder} from './arith'
import BitReader from './bitstream'
import {meshPayloadFromCompressedData} from './container'
import {decodeMesh} from './decoder'
import {UnsupportedMtsError, readHeader} from './header'
import SplitMesh from './mesh'


const PM_ADF = resolve(__dirname, '../../tests/fixtures/github/bldrs-ai/test-models/main/adf/PM.adf')
const DLL_RESULTS = resolve(__dirname, '../../../testdata/models/adf/PM.adf.mts-dll.json')


/** @return {Array<{key: string, payload: Uint8Array}>} every crown and initial-shape stream */
function pmStreams() {
  const {root} = parseADF(readFileSync(PM_ADF))
  const out = []
  for (const jaw of [root.JawPair.upper, root.JawPair.lower]) {
    for (const tooth of asList(jaw.Tooth)) {
      const id = i32(tooth.id)
      const crown = tooth.CompressedQedge.CompressedData.bytes
      const initial = tooth.QedgeToothDesigner.InitialToothShape.CompressedQedge.CompressedData.bytes
      out.push({key: `${id}/crown`, payload: meshPayloadFromCompressedData(crown)})
      out.push({key: `${id}/initial`, payload: meshPayloadFromCompressedData(initial)})
    }
  }
  return out
}


/**
 * Re-encode a stream's six header counts, keeping every other bit. Mirrors
 * `BitReader#readUInt`: a 5-bit length `L`, then the low `L − 1` bits.
 *
 * @param {Uint8Array} payload
 * @param {object} counts replacements by name, as in `readHeader().counts`
 * @return {Uint8Array}
 */
function withCounts(payload, counts) {
  const header = readHeader(new BitReader(payload))
  const src = new BitReader(payload)
  src.readBits(32)
  src.readUInt()
  const start = src.pos
  for (let k = 0; k < 6; k++) {
    src.readUInt()
  }
  const end = src.pos
  const bits = []
  const put = (v, n) => {
    for (let k = 0; k < n; k++) {
      bits.push(Math.floor(v / (2 ** k)) % 2)
    }
  }
  src.pos = 0
  for (let k = 0; k < start; k++) {
    bits.push(src.read1())
  }
  for (const name of ['vertices', 'faces', 'baseVertices', 'baseFaces', 'splits', 'reserved']) {
    const v = counts[name] ?? header.counts[name]
    const len = v === 0 ? 0 : Math.floor(Math.log2(v)) + 1
    put(len, 5)
    if (len > 0) {
      put(v - (2 ** (len - 1)), len - 1)
    }
  }
  src.pos = end
  while (src.pos < src.length) {
    bits.push(src.read1())
  }
  const out = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((b, k) => {
    out[k >> 3] |= b << (k & 7)
  })
  return out
}


/**
 * @param {Float32Array|Uint32Array} view
 * @return {string}
 */
function sha1(view) {
  return createHash('sha1').update(Buffer.from(view.buffer, view.byteOffset, view.byteLength)).digest('hex')
}


describe('loader/mts/decoder', () => {
  const dll = JSON.parse(readFileSync(DLL_RESULTS, 'utf8')).meshes
  const streams = pmStreams()

  it('covers every mesh the DLL decoded', () => {
    expect(streams.map((s) => s.key).sort()).toEqual(Object.keys(dll).sort())
  })

  it.each(streams.map((s) => [s.key, s]))('decodes %s exactly as the DLL does', (key, {payload}) => {
    const want = dll[key]
    const got = decodeMesh(payload)
    expect({
      vertices: got.positions.length / 3,
      faces: got.indices.length / 3,
      bitsRead: got.bitsRead,
      bitLength: got.bitLength,
      positionsSha1: sha1(got.positions),
      facesSha1: sha1(got.indices),
    }).toEqual(want)
  })

  it('reports the shared bit cursor, so truncation is visible', () => {
    const {payload} = streams[0]
    const got = decodeMesh(payload)
    // The DLL leaves at most a few padding bits of the last byte unread.
    expect(got.bitLength - got.bitsRead).toBeLessThan(8)
  })

  // Corrupt input must fail its own tooth quickly: decodeMesh runs on the
  // main thread, so a hang freezes the tab, and adf.js can only fall back to
  // a proxy crown for a tooth that throws.
  describe('on corrupt input', () => {
    const byKey = Object.fromEntries(streams.map((s) => [s.key, s.payload]))

    it.each([
      // Before the arithmetic state was bounds-checked, this cut sent
      // renorm's range through an int32 overflow to 0 and it never returned.
      ['13/crown', 7273],
      // These decoded "successfully" with hundreds of wrong coordinates.
      ['8/crown', 0.99],
      ['13/crown', 0.9],
      ['8/crown', -1],
    ])('throws on %s truncated to %s', (key, keep) => {
      const full = byKey[key]
      const bytes = keep < 0 ? full.length + keep : keep < 1 ? Math.floor(full.length * keep) : keep
      expect(() => decodeMesh(full.slice(0, bytes))).toThrow(/^mts: /)
    })

    it('rejects header counts the stream is too short to hold', () => {
      const payload = withCounts(byKey['8/crown'], {vertices: 2 ** 24, faces: 2 ** 25, splits: 2 ** 24})
      // Guard the helper: the counts really were re-encoded.
      expect(readHeader.bind(null, new BitReader(payload))).toThrow(/16777216 vertices/)
      expect(() => decodeMesh(payload)).toThrow(/^mts: corrupt stream/)
    })

    it('throws on a header bit flip that once hung reading a garbage string length', () => {
      const payload = byKey['23/crown'].slice()
      payload[630 >> 3] ^= 1 << (630 & 7)
      expect(() => decodeMesh(payload)).toThrow(/^mts: /)
    })

    it('rejects an arithmetic budget longer than the stream, and running far past it', () => {
      const bs = new BitReader(new Uint8Array(4))
      expect(() => new ArithDecoder(bs, 33)).toThrow(/budget 33 runs past the end/)
      const coder = new ArithDecoder(new BitReader(new Uint8Array(4)), 16)
      // 16 bits were spent seeding `value`; up to 32 more zeros are allowed.
      for (let k = 0; k < 32; k++) {
        coder.nextBit()
      }
      expect(() => coder.nextBit()).toThrow(/overran its budget/)
    })

    it('throws instead of renormalizing a state outside the 16-bit window', () => {
      const coder = new ArithDecoder(new BitReader(new Uint8Array(4)), 0)
      coder.low = -1
      expect(() => coder.renorm()).toThrow(/state out of range/)
      coder.low = 0x8000
      coder.range = 0x8001
      expect(() => coder.renorm()).toThrow(/state out of range/)
    })

    it('caps total ring walking, which a crafted stream can make quadratic', () => {
      const mesh = new SplitMesh(2)
      mesh.faceCount = 1
      mesh.checkWalk(0, 1)
      mesh.checkWalk(0, 1)
      expect(() => mesh.checkWalk(0, 1)).toThrow(/too much ring walking/)
    })

    it('throws when asked for a symbol from an empty range', () => {
      const coder = new ArithDecoder(new BitReader(new Uint8Array(4)), 0)
      expect(() => coder.uniform(0)).toThrow(/^mts: corrupt stream/)
      expect(() => coder.symbolBounded(new AdaptiveModel(3), 0)).toThrow(/^mts: corrupt stream/)
    })
  })

  it('refuses a key-protected stream instead of decoding garbage', () => {
    const payload = streams[0].payload.slice()
    // Flag bit 0 marks an encrypted stream (0x1180faa0 then demands a key).
    payload[0] |= 1
    expect(() => readHeader(new BitReader(payload))).toThrow(UnsupportedMtsError)
  })
})
