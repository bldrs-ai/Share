// The `.gz` envelope, against a REAL `DecompressionStream`.
//
// jsdom implements none, so Node's own is planted — the same WHATWG interface
// the browser gives, over the same zlib — and the fixtures are gzipped by
// node's zlib rather than by the code under test, so a round trip that only
// agreed with itself would not pass.
import {
  CompressionStream as NodeCompressionStream,
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web'
import {gzipSync} from 'node:zlib'
import {GzipExpansionError, gunzipBytes} from '../export/glbGzip'
import {
  GzipEnvelopeError,
  decodeGzipEnvelope,
  inflateIfGzipEnvelope,
} from './gzipEnvelope'


// The real inflate everywhere but the one test that needs it to fail on
// demand: a bomb that trips the ceiling for real costs 512 MiB and ~7s per
// run, which is `export/glbGzip.test.js`'s job at a cap it can choose.
jest.mock('../export/glbGzip', () => {
  const actual = jest.requireActual('../export/glbGzip')
  return {...actual, gunzipBytes: jest.fn((...args) => actual.gunzipBytes(...args))}
})


// A GLB is recognized by its first four bytes; the rest of a real one is not
// what either seam here looks at.
const GLB_BYTES = new TextEncoder().encode('glTFtherestofaperfectlyordinarybinaryglTF')
// SPZ's magic on the DECOMPRESSED bytes, which is what makes a .spz a splat
// rather than a gzip envelope around something else.
const SPZ_BYTES = new Uint8Array([...new TextEncoder().encode('NGSP'), 2, 0, 0, 0])
// Enough payload that a member missing its tail still inflates a head.
const BYTES_PER_KIB = 1024
const KIB_ENOUGH_TO_SNIFF_AFTER_TRUNCATION = 64
const BIG_ENOUGH_TO_SNIFF_AFTER_TRUNCATION = KIB_ENOUGH_TO_SNIFF_AFTER_TRUNCATION * BYTES_PER_KIB
const TRUNCATED_TAIL_BYTES = 8


/**
 * @param {Uint8Array} bytes
 * @return {Uint8Array} the same bytes as a gzip member
 */
function gzipped(bytes) {
  return new Uint8Array(gzipSync(Buffer.from(bytes)))
}


// Every picked file this module sees carries the same timestamp, so a test
// can assert the inflated one kept it.
const PICKED_AT = 1_700_000_000_000


/**
 * A stand-in for a picked `File`, carrying the surface this module uses.
 *
 * Built on the global `Blob` rather than `new File(...)` because under
 * `jest-fixed-jsdom` those are two different classes: the global Blob is
 * node's, with `arrayBuffer()`, while jsdom's `File` has none and neither do
 * its slices — so a jsdom File could not be READ by the code under test.
 * A browser's File has both.
 *
 * @param {Uint8Array} bytes
 * @param {string} name
 * @return {Blob} with `name` and `lastModified`, as a File has
 */
function fileOf(bytes, name) {
  return Object.assign(new Blob([bytes]), {name, lastModified: PICKED_AT})
}


/**
 * The bytes of whatever came back — the input Blob on a pass-through, a real
 * `File` when the envelope came off, and jsdom's File only reads through
 * `FileReader`.
 *
 * @param {Blob|File} fileLike
 * @return {Promise<Array<number>>}
 */
async function bytesOf(fileLike) {
  if (typeof fileLike.arrayBuffer === 'function') {
    return [...new Uint8Array(await fileLike.arrayBuffer())]
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve([...new Uint8Array(reader.result)])
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(fileLike)
  })
}


describe('gzipEnvelope', () => {
  beforeEach(() => {
    global.CompressionStream = NodeCompressionStream
    global.DecompressionStream = NodeDecompressionStream
  })

  afterEach(() => {
    delete global.CompressionStream
    delete global.DecompressionStream
  })

  describe('inflateIfGzipEnvelope', () => {
    it('inflates a .glb.gz, keeping the name the user picked', async () => {
      // The round trip this feature exists to close: Share exports
      // `index.glb.gz` (#1854) and has to open it back. What comes out is the
      // GLB, under the user's own filename — the name is the recents display
      // and the load report's, not something anything resolves against
      // (#1682), so rewriting it would lose the only record of what they
      // opened.
      const file = fileOf(gzipped(GLB_BYTES), 'index.glb.gz')

      const out = await inflateIfGzipEnvelope(file)

      expect(await bytesOf(out)).toEqual([...GLB_BYTES])
      expect(out.name).toBe('index.glb.gz')
      expect(out.lastModified).toBe(PICKED_AT)
    })

    it('inflates by header, whatever the name says', async () => {
      // The name is evidence, not authority: a `.glb.gz` that arrived as
      // `model.bin` — mangled by a download, a mail client, a rename — is
      // still a gzipped GLB, and the 0x1f8b in front of it is what says so.
      const out = await inflateIfGzipEnvelope(fileOf(gzipped(GLB_BYTES), 'model.bin'))

      expect(await bytesOf(out)).toEqual([...GLB_BYTES])
    })

    it('leaves a .spz alone, because gzip is that format\'s container', async () => {
      // The one supported format that IS a gzip stream. Inflating it would
      // hand the splat decoder bytes it does not read, so the sniff has to
      // answer 'spz' before it ever considers an envelope.
      const spz = gzipped(SPZ_BYTES)

      const out = await inflateIfGzipEnvelope(fileOf(spz, 'cloud.spz'))

      expect(await bytesOf(out)).toEqual([...spz])
    })

    it('leaves a gzipped non-model alone, so it still fails sniffing cleanly', async () => {
      // A .tar.gz or a gzipped log dropped on the viewer must keep producing
      // the "unknown type" alert. Inflating first would only move that alert
      // later and make it cost an inflate of an arbitrarily large archive.
      const tarball = gzipped(new TextEncoder().encode('not a model, just gzipped text'))

      const out = await inflateIfGzipEnvelope(fileOf(tarball, 'logs.tar.gz'))

      expect(await bytesOf(out)).toEqual([...tarball])
    })

    it('leaves an uncompressed file alone', async () => {
      const out = await inflateIfGzipEnvelope(fileOf(GLB_BYTES, 'index.glb'))

      expect(await bytesOf(out)).toEqual([...GLB_BYTES])
    })

    it('passes through a handle it cannot read, rather than blaming compression', async () => {
      // The file moved between the pick and here, or the environment's Blob
      // cannot be read. Either way this seam has nothing to say about it: the
      // sniff and the loader report it as they did before there was an
      // envelope to look for.
      const unreadable = {
        name: 'index.glb.gz',
        size: 10,
        slice: () => ({arrayBuffer: () => Promise.reject(new Error('NotReadableError'))}),
      }

      expect(await inflateIfGzipEnvelope(unreadable)).toBe(unreadable)
    })

    it('says what is wrong where there is no DecompressionStream', async () => {
      // Safari before 16.4 — the same bound the v3 OPFS container has. The
      // one outcome this must not have is a stack trace out of a missing
      // global: the file is openable, just not here, and the message has to
      // say so.
      delete global.DecompressionStream

      await expect(inflateIfGzipEnvelope(fileOf(gzipped(GLB_BYTES), 'index.glb.gz')))
        .rejects.toThrow(GzipEnvelopeError)
      await expect(inflateIfGzipEnvelope(fileOf(gzipped(GLB_BYTES), 'index.glb.gz')))
        .rejects.toThrow(/Safari 16\.4/)
    })

    it('turns a tripped ceiling into a sentence about the file', async () => {
      // The decompression bomb. gzip reaches ~1032:1, so a few MB of hostile
      // input is hundreds of GB, and an unbounded inflate ends the tab rather
      // than the load. The ceiling itself is enforced mid-inflate inside
      // `gunzipBytes`, where `export/glbGzip.test.js` measures it on real
      // bytes; what is checked HERE is the half that reaches the user — that
      // the refusal arrives as a `GzipEnvelopeError` naming the model, not as
      // a stream error naming a byte count. Driven through the mocked inflate
      // because doing it for real means expanding half a gigabyte per run.
      gunzipBytes.mockRejectedValueOnce(new GzipExpansionError('Gzip member expands past 536870912 bytes'))

      await expect(inflateIfGzipEnvelope(fileOf(gzipped(GLB_BYTES), 'bomb.glb.gz')))
        .rejects.toThrow(/larger than any model Share can open/)
    })

    it('reports a corrupt member as a failure to decompress, not as a bomb', async () => {
      // Truncated mid-transfer: the header still says gzip and the sniff
      // still says glb, so this reaches the inflate and has to come back as
      // one catchable error with its own sentence.
      // Long enough that its gzip member has a head to sniff after the cut:
      // a member truncated so early that nothing inflates is not corrupt as
      // far as this module can tell — it sniffs as unknown and is passed
      // through untouched, which the drop handler already reports.
      const padded = new Uint8Array(BIG_ENOUGH_TO_SNIFF_AFTER_TRUNCATION)
      padded.set(GLB_BYTES)
      const member = gzipped(padded)
      const truncated = member.subarray(0, member.byteLength - TRUNCATED_TAIL_BYTES)

      await expect(inflateIfGzipEnvelope(fileOf(truncated, 'index.glb.gz')))
        .rejects.toThrow(/Could not decompress/)
    })
  })

  describe('decodeGzipEnvelope', () => {
    it('inflates gzipped bytes on their way into a glb load', async () => {
      // The net under every path the upload seam cannot reach: a locally
      // hosted `/x.glb.gz`, a pasted URL, the non-OPFS upload fallback that
      // hands the loader the original blob.
      const out = await decodeGzipEnvelope(gzipped(GLB_BYTES).buffer, 'glb')

      expect([...new Uint8Array(out)]).toEqual([...GLB_BYTES])
      expect(out).toBeInstanceOf(ArrayBuffer)
    })

    it('leaves an spz load compressed', async () => {
      const spz = gzipped(SPZ_BYTES)

      const out = await decodeGzipEnvelope(spz.buffer, 'spz')

      expect([...new Uint8Array(out)]).toEqual([...spz])
    })

    it('leaves uncompressed bytes, decoded text and a File handle alone', async () => {
      // Three shapes `modelData` arrives in by this point. The string is a
      // text format already through TextDecoder — gzip bytes decoded that way
      // are mojibake, not something to recognize — and the File is conway's
      // store-backed part-21 open, handed to the parser unread.
      const plain = GLB_BYTES.buffer
      expect(await decodeGzipEnvelope(plain, 'glb')).toBe(plain)
      expect(await decodeGzipEnvelope('solid teapot', 'stl')).toBe('solid teapot')
      const handle = fileOf(GLB_BYTES, 'model.ifc')
      expect(await decodeGzipEnvelope(handle, 'ifc')).toBe(handle)
    })
  })
})
