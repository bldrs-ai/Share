// The MetaStream decoder against what Viewpoint's own Mts3Reader.dll decodes
// from the same bytes (design/new/adf-mts-decoder.md §4). The DLL can't run
// here, so its results for all 54 meshes in PM.adf were recorded once with
// tools/adf-mts/oracle.py and are checked in as hashes.
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {asList, i32, parseADF} from '../adf/adf-parser'
import BitReader from './bitstream'
import {meshPayloadFromCompressedData} from './container'
import {decodeMesh} from './decoder'
import {UnsupportedMtsError, readHeader} from './header'


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

  it('refuses a key-protected stream instead of decoding garbage', () => {
    const payload = streams[0].payload.slice()
    // Flag bit 0 marks an encrypted stream (0x1180faa0 then demands a key).
    payload[0] |= 1
    expect(() => readHeader(new BitReader(payload))).toThrow(UnsupportedMtsError)
  })
})
