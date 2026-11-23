/* eslint-disable no-magic-numbers */
// The DICOM reader and series stacker, over slices written by pydicom
// (`tools/models/makeDicomPhantom.py`, an independent writer) and, for the
// refusals, over minimal files built here.
import fs from 'fs'
import path from 'path'
import pako from 'pako'
import {NRRDLoader} from 'three/examples/jsm/loaders/NRRDLoader.js'
import {unzipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {DicomError, dicomSeriesToNrrd, groupSeries, looksLikeDicom, parseDicomSlice} from './dicom'


// What fflate's Inflate has handed out, for the bomb test: whether the cap
// stopped the inflate early, or only checked it after inflating everything.
const mockInflated = {total: 0}
jest.mock('three/examples/jsm/libs/fflate.module.js', () => {
  const actual = jest.requireActual('three/examples/jsm/libs/fflate.module.js')
  /** Counts each chunk it hands on. */
  class CountingInflate extends actual.Inflate {
    /** @param {Function} ondata */
    constructor(ondata) {
      super((chunk, final) => {
        mockInflated.total += chunk.length
        ondata(chunk, final)
      })
    }
  }
  return {...actual, Inflate: CountingInflate}
})


// The phantom, as makeDicomPhantom.py writes it: 32 slices of 48 rows × 40
// columns, 0.8 mm between rows, 0.7 mm between columns, 2.5 mm apart from
// z = 50, SliceThickness 3 mm (thicker than the gap on purpose), origin
// (-100, -80). Values in HU: air -1000, tissue 40, bone shell 1200, and a
// 2500 sphere centred six columns right of the middle.
const ROWS = 48
const COLUMNS = 40
const SLICES = 32


/**
 * @param {string} name under testdata/models/dicom/
 * @return {Array<Uint8Array>} each slice file in the zip, in archive order
 */
function sliceFilesOf(name) {
  const zip = fs.readFileSync(path.join(__dirname, '../../testdata/models/dicom', name))
  const entries = unzipSync(new Uint8Array(zip))
  return Object.entries(entries).filter(([p]) => !p.endsWith('.txt')).map(([, bytes]) => bytes)
}


/**
 * @param {Uint8Array} nrrd
 * @return {object} NRRDLoader's Volume
 */
function parseNrrd(nrrd) {
  return new NRRDLoader().parse(nrrd.buffer.slice(nrrd.byteOffset, nrrd.byteOffset + nrrd.byteLength))
}


const EXPLICIT_LE = '1.2.840.10008.1.2.1'
const IMPLICIT_LE = '1.2.840.10008.1.2'
const UNDEFINED = 0xffffffff


/**
 * A DICOM element encoder, in explicit or implicit VR little endian.
 *
 * - `el(group, element, vr, value)`: one element. A string value is padded
 *   to even length; a number is a US.
 * - `sq(group, element, items, {vr})`: an undefined-length sequence (or,
 *   with `vr: 'UN'`, the UN form PS3.5 §6.2.2 describes) of `items`, each
 *   an array of elements, written as undefined-length items.
 *
 * @param {boolean} explicit
 * @return {{el: Function, sq: Function}}
 */
function encoder(explicit) {
  const head = (group, element, vr, length) => {
    const isLong = !explicit || ['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr)
    const view = new DataView(new ArrayBuffer(explicit && isLong ? 12 : 8))
    view.setUint16(0, group, true)
    view.setUint16(2, element, true)
    if (!explicit) {
      view.setUint32(4, length, true)
    } else if (isLong) {
      view.setUint8(4, vr.charCodeAt(0))
      view.setUint8(5, vr.charCodeAt(1))
      view.setUint32(8, length, true)
    } else {
      view.setUint8(4, vr.charCodeAt(0))
      view.setUint8(5, vr.charCodeAt(1))
      view.setUint16(6, length, true)
    }
    return new Uint8Array(view.buffer)
  }
  // Items and delimiters carry no VR in either syntax.
  const structural = (element, length) => {
    const view = new DataView(new ArrayBuffer(8))
    view.setUint16(0, 0xfffe, true)
    view.setUint16(2, element, true)
    view.setUint32(4, length, true)
    return new Uint8Array(view.buffer)
  }
  const el = (group, element, vr, value) => {
    let bytes
    if (typeof value === 'number') {
      bytes = new Uint8Array(new Uint16Array([value]).buffer)
    } else if (typeof value === 'string') {
      bytes = new TextEncoder().encode(value.length % 2 ? `${value} ` : value)
    } else {
      bytes = value
    }
    return concat([head(group, element, vr, bytes.length), bytes])
  }
  const sq = (group, element, items, {vr = 'SQ'} = {}) => concat([
    head(group, element, vr, UNDEFINED),
    ...items.flatMap((elements) => [structural(0xe000, UNDEFINED), ...elements, structural(0xe00d, 0)]),
    structural(0xe0dd, 0),
  ])
  return {el, sq}
}


const {el} = encoder(true)


/**
 * @param {Array<Uint8Array>} parts
 * @return {Uint8Array}
 */
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}


/**
 * @param {Uint8Array} value
 * @return {Uint8Array} an encapsulated item (FFFE,E000) holding it
 */
function item(value) {
  const head = new DataView(new ArrayBuffer(8))
  head.setUint16(0, 0xfffe, true)
  head.setUint16(2, 0xe000, true)
  head.setUint32(4, value.length, true)
  return concat([new Uint8Array(head.buffer), value])
}


/** @return {Uint8Array} a sequence delimiter (FFFE,E0DD) */
function delimiter() {
  const head = new DataView(new ArrayBuffer(8))
  head.setUint16(0, 0xfffe, true)
  head.setUint16(2, 0xe0dd, true)
  return new Uint8Array(head.buffer)
}


/**
 * A one-slice DICOM file: a 2 × 2 signed 16-bit image, with `overrides`
 * replacing or adding elements. The meta group is explicit VR, as Part 10
 * requires; the dataset is in `transferSyntax`.
 *
 * @param {object} [opts]
 * @param {string} [opts.transferSyntax]
 * @param {object} [opts.overrides] keyed `gggg,eeee` → element bytes, a
 *   function of the dataset's encoder returning them, or null to drop
 * @return {Uint8Array}
 */
function makeDicom({transferSyntax = EXPLICIT_LE, overrides = {}} = {}) {
  const enc = encoder(transferSyntax !== IMPLICIT_LE)
  const dataset = {
    '0008,0060': enc.el(0x0008, 0x0060, 'CS', 'CT'),
    '0020,000e': enc.el(0x0020, 0x000e, 'UI', '1.2.3'),
    '0028,0002': enc.el(0x0028, 0x0002, 'US', 1),
    '0028,0010': enc.el(0x0028, 0x0010, 'US', 2),
    '0028,0011': enc.el(0x0028, 0x0011, 'US', 2),
    '0028,0100': enc.el(0x0028, 0x0100, 'US', 16),
    '0028,0103': enc.el(0x0028, 0x0103, 'US', 1),
    '7fe0,0010': enc.el(0x7fe0, 0x0010, 'OW', new Uint8Array(new Int16Array([1, 2, 3, 4]).buffer)),
  }
  for (const [key, value] of Object.entries(overrides)) {
    dataset[key] = typeof value === 'function' ? value(enc) : value
  }
  return concat([
    new Uint8Array(128),
    new TextEncoder().encode('DICM'),
    el(0x0002, 0x0010, 'UI', transferSyntax),
    ...Object.keys(dataset).sort().map((k) => dataset[k]).filter(Boolean),
  ])
}


/**
 * @return {Array<object>} the phantom scan's slices, parsed, archive order
 */
function phantomScan() {
  return groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))[0]
}


describe('loader/dicom', () => {
  describe('looksLikeDicom', () => {
    it('recognizes the preamble and DICM, and nothing shorter', () => {
      expect(looksLikeDicom(makeDicom())).toBe(true)
      expect(looksLikeDicom(new Uint8Array(132))).toBe(false)
      expect(looksLikeDicom(new TextEncoder().encode('DICM'))).toBe(false)
    })
  })

  describe('parseDicomSlice', () => {
    it.each(['phantom-ct.zip', 'phantom-ct-implicit-vr.zip'])(
      'reads geometry, rescale and pixels from pydicom\'s %s', (zip) => {
        const slices = sliceFilesOf(zip).map(parseDicomSlice)
        const scan = slices.filter((s) => s.rows === ROWS)
        expect(scan).toHaveLength(SLICES)
        const [s] = scan
        expect(s).toMatchObject({
          modality: 'CT',
          columns: COLUMNS,
          pixelSpacing: [0.8, 0.7],
          sliceThickness: 3,
          orientation: [1, 0, 0, 0, 1, 0],
          bitsAllocated: 16,
          isSigned: false,
          slope: 1,
          intercept: -1024,
        })
        expect(s.pixelData.length).toBe(ROWS * COLUMNS * 2)
        expect(s.position.slice(0, 2)).toEqual([-100, -80])
        expect(new Set(scan.map((x) => x.position[2])).size).toBe(SLICES)
      })

    describe.each([['explicit', EXPLICIT_LE], ['implicit', IMPLICIT_LE]])('in %s VR', (_label, syntax) => {
      // pydicom writes its sequences with defined lengths, which are stepped
      // over whole; these are undefined-length, the form scanners write, so
      // the walk has to find each delimiter.
      it('walks undefined-length sequences nested in undefined-length items', () => {
        const nested = (enc) => enc.sq(0x0008, 0x1032, [[
          enc.el(0x0008, 0x0100, 'SH', 'X'),
          enc.sq(0x0040, 0xa043, [[enc.el(0x0008, 0x0104, 'LO', 'nested')], []]),
        ]])
        const slice = parseDicomSlice(makeDicom({transferSyntax: syntax, overrides: {'0008,1032': nested}}))
        expect(slice.rows).toBe(2)
        expect(Array.from(new Int16Array(slice.pixelData.slice().buffer))).toEqual([1, 2, 3, 4])
      })

      it('steps over an icon\'s Pixel Data, and reads the image\'s', () => {
        // An Icon Image Sequence holds a thumbnail with its own Rows, Columns
        // and Pixel Data. Only the dataset's own Pixel Data is the image.
        const icon = (enc) => enc.sq(0x0088, 0x0200, [[
          enc.el(0x0028, 0x0010, 'US', 1),
          enc.el(0x0028, 0x0011, 'US', 1),
          enc.el(0x7fe0, 0x0010, 'OB', new Uint8Array([9, 9])),
        ]])
        const slice = parseDicomSlice(makeDicom({transferSyntax: syntax, overrides: {'0088,0200': icon}}))
        expect([slice.rows, slice.columns]).toEqual([2, 2])
        expect(Array.from(new Int16Array(slice.pixelData.slice().buffer))).toEqual([1, 2, 3, 4])
      })
    })

    it('reads an undefined-length UN element\'s contents as implicit VR, in an explicit file', () => {
      // A private sequence a PACS re-encoded as UN (PS3.5 §6.2.2). Read as
      // explicit, the implicit item's first element would be misparsed.
      const implicit = encoder(false)
      const un = (enc) => enc.sq(0x0009, 0x1010, [[implicit.el(0x0009, 0x1011, null, 'abcd')]], {vr: 'UN'})
      expect(parseDicomSlice(makeDicom({overrides: {'0009,1010': un}})).rows).toBe(2)
    })

    it('returns null for a DICOM file with no image in it', () => {
      expect(parseDicomSlice(makeDicom({overrides: {'7fe0,0010': null}}))).toBeNull()
    })

    it('refuses a compressed series, naming its transfer syntax', () => {
      // JPEG Baseline; the pixel data is encapsulated (undefined length).
      const encapsulated = concat([
        el(0x7fe0, 0x0010, 'OB', new Uint8Array(0)).subarray(0, 8),
        new Uint8Array([0xff, 0xff, 0xff, 0xff]),
      ])
      const bytes = makeDicom({transferSyntax: '1.2.840.10008.1.2.4.50', overrides: {'7fe0,0010': encapsulated}})
      expect(() => parseDicomSlice(bytes)).toThrow(DicomError)
      expect(() => parseDicomSlice(bytes)).toThrow(/compressed \(transfer syntax 1\.2\.840\.10008\.1\.2\.4\.50\)/)
    })

    it('names a big-endian or still-compressed series as such, rather than as damage', () => {
      // Neither can be walked, so the syntax is judged where the meta group
      // ends, before the walk would fail on it.
      expect(() => parseDicomSlice(makeDicom({transferSyntax: '1.2.840.10008.1.2.2'})))
        .toThrow(/big-endian \(transfer syntax 1\.2\.840\.10008\.1\.2\.2\)/)
      // JPEG Lossless: no decoder in the bundle.
      expect(() => parseDicomSlice(makeDicom({transferSyntax: '1.2.840.10008.1.2.4.70'})))
        .toThrow(/compressed \(transfer syntax 1\.2\.840\.10008\.1\.2\.4\.70\)/)
    })

    describe('compressed syntaxes it decodes', () => {
      // pydicom wrote these (its own RLE encoder, zlib's deflate), from the
      // same phantom as phantom-ct.zip: decoded, they must stack to the same
      // volume, byte for byte.
      const stack = (zip) => dicomSeriesToNrrd(groupSeries(sliceFilesOf(zip).map(parseDicomSlice))[0])
      const plain = () => Buffer.from(stack('phantom-ct.zip'))

      it.each(['phantom-ct-rle.zip', 'phantom-ct-deflated.zip'])('%s stacks to the uncompressed volume', (zip) => {
        expect(Buffer.from(stack(zip)).equals(plain())).toBe(true)
      })

      it('refuses a damaged RLE frame', () => {
        const [slice] = sliceFilesOf('phantom-ct-rle.zip').filter((b) => b.length > 1000)
        // The frame's header starts after the Basic Offset Table item: find
        // its segment count (2, for 16-bit) and claim 3.
        const bytes = slice.slice()
        const pixelTag = [0xe0, 0x7f, 0x10, 0x00]
        const at = bytes.findIndex((_, i) => pixelTag.every((b, k) => bytes[i + k] === b))
        // Pixel Data header (12), BOT item (8 + its length), fragment item (8).
        const view = new DataView(bytes.buffer)
        const botLength = view.getUint32(at + 12 + 4, true)
        const frameAt = at + 12 + 8 + botLength + 8
        expect(view.getUint32(frameAt, true)).toBe(2)
        view.setUint32(frameAt, 3, true)
        expect(() => parseDicomSlice(bytes)).toThrow(/RLE-compressed DICOM slice in this series is damaged/)
        // And one cut short inside the frame, its items still well formed: the
        // fragment item and the frame shrink by 200 bytes, the delimiter
        // stays. The segments then end before the image is full.
        const fragmentLengthAt = at + 12 + 8 + botLength + 4
        const fragmentLength = new DataView(slice.buffer).getUint32(fragmentLengthAt, true)
        const fragmentEnd = fragmentLengthAt + 4 + fragmentLength
        const short = concat([slice.subarray(0, fragmentEnd - 200), slice.subarray(fragmentEnd)])
        new DataView(short.buffer).setUint32(fragmentLengthAt, fragmentLength - 200, true)
        expect(() => parseDicomSlice(short)).toThrow(/RLE-compressed DICOM slice in this series is damaged/)
      })

      it('refuses a deflated dataset that doesn\'t inflate', () => {
        // The meta group says deflated; the dataset after it is plain bytes.
        expect(() => parseDicomSlice(makeDicom({transferSyntax: '1.2.840.10008.1.2.1.99'})))
          .toThrow(/doesn't inflate/)
      })

      it('stops a deflate bomb at its cap, rather than inflate it all', () => {
        // 256 MiB of zeros deflate to ~256 KB; the cap is 64 MiB a slice.
        // Built a megabyte at a time, so the test never holds the 256 MiB.
        const deflater = new pako.Deflate({raw: true})
        const zeros = new Uint8Array(1024 * 1024)
        for (let i = 0; i < 256; i++) {
          deflater.push(zeros, false)
        }
        deflater.push(new Uint8Array(0), true)
        const bomb = deflater.result
        // Keep the preamble and meta group; replace the dataset with the bomb.
        const syntax = '1.2.840.10008.1.2.1.99'
        const metaEnd = 132 + el(0x0002, 0x0010, 'UI', syntax).length
        const bytes = concat([makeDicom({transferSyntax: syntax}).subarray(0, metaEnd), bomb])
        mockInflated.total = 0
        expect(() => parseDicomSlice(bytes)).toThrow(/inflates to more than any slice should/)
        // Stopped near the cap: not the 256 MiB a one-shot push inflates
        // before the first count.
        expect(mockInflated.total).toBeGreaterThan(64 * 1024 * 1024)
        expect(mockInflated.total).toBeLessThan(96 * 1024 * 1024)
      })

      it('refuses a replicate run whose value byte lies past its segment', () => {
        // One 8-bit segment, 3 pixels: a 1-byte literal, then a replicate
        // control byte (-1, "repeat the next byte twice") as the segment's
        // last byte. Unguarded, it would take its value from past the
        // segment (here past the frame, so 0) and decode 3 pixels "fine".
        const frame = new Uint8Array(67)
        new DataView(frame.buffer).setUint32(0, 1, true)
        new DataView(frame.buffer).setUint32(4, 64, true)
        frame.set([0x00, 0x11, 0xff], 64)
        const rle = (enc) => concat([
          enc.el(0x7fe0, 0x0010, 'OB', new Uint8Array(0)).subarray(0, 8),
          new Uint8Array([0xff, 0xff, 0xff, 0xff]),
          item(new Uint8Array(0)),
          item(frame),
          delimiter(),
        ])
        const bytes = makeDicom({transferSyntax: '1.2.840.10008.1.2.5', overrides: {
          '0028,0010': el(0x0028, 0x0010, 'US', 1),
          '0028,0011': el(0x0028, 0x0011, 'US', 3),
          '0028,0100': el(0x0028, 0x0100, 'US', 8),
          '7fe0,0010': rle,
        }})
        expect(() => parseDicomSlice(bytes)).toThrow(/RLE-compressed DICOM slice in this series is damaged/)
      })

      it('refuses a huge image over a tiny RLE frame without allocating it', () => {
        // 65535 × 65535 16-bit is an 8.6 GB frame; the segments are bytes.
        const [slice] = sliceFilesOf('phantom-ct-rle.zip').filter((b) => b.length > 1000)
        const bytes = slice.slice()
        const view = new DataView(bytes.buffer)
        for (const tag of [[0x28, 0x00, 0x10, 0x00], [0x28, 0x00, 0x11, 0x00]]) {
          const at = bytes.findIndex((_, i) => tag.every((b, k) => bytes[i + k] === b))
          view.setUint16(at + 8, 65535, true)
        }
        // Node allocates a huge typed array lazily, so it would "succeed"
        // here; a browser's ArrayBuffer limit throws instead. Stand that limit
        // in for this test: a RangeError escaping as itself would end the
        // whole series instead of setting one slice aside.
        const RealUint8Array = global.Uint8Array
        global.Uint8Array = class extends RealUint8Array {
          /** @param {...any} args */
          constructor(...args) {
            if (typeof args[0] === 'number' && args[0] > 1e9) {
              throw new RangeError('Array buffer allocation failed')
            }
            super(...args)
          }
        }
        try {
          expect(() => parseDicomSlice(bytes)).toThrow(/RLE-compressed DICOM slice in this series is damaged/)
        } finally {
          global.Uint8Array = RealUint8Array
        }
      })
    })

    it('refuses color, multi-frame and 32-bit images', () => {
      expect(() => parseDicomSlice(makeDicom({overrides: {'0028,0002': el(0x0028, 0x0002, 'US', 3)}})))
        .toThrow(/color/)
      expect(() => parseDicomSlice(makeDicom({overrides: {'0028,0008': el(0x0028, 0x0008, 'IS', '4')}})))
        .toThrow(/multi-frame/)
      expect(() => parseDicomSlice(makeDicom({overrides: {'0028,0100': el(0x0028, 0x0100, 'US', 32)}})))
        .toThrow(/32-bit/)
    })

    it('refuses a file cut short, as damage rather than a RangeError', () => {
      const whole = makeDicom()
      // From the end: Pixel Data (20 bytes), then three 10-byte US elements.
      // -45 keeps half of Columns' header (a partial element); -41 keeps its
      // header and half its value (an element past the end).
      expect(() => parseDicomSlice(whole.subarray(0, whole.length - 45))).toThrow(/damaged/)
      expect(() => parseDicomSlice(whole.subarray(0, whole.length - 41))).toThrow(/damaged/)
      // Into the pixels: the image is there, short.
      expect(() => parseDicomSlice(whole.subarray(0, whole.length - 2))).toThrow(/cut short/)
    })
  })

  describe('groupSeries', () => {
    it('puts the scan first and the scout after it', () => {
      const series = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      expect(series.map((s) => s.length)).toEqual([SLICES, 1])
    })

    it('splits echoes that share a series and every position into stacks of their own', () => {
      // Mixed, ordering by position would keep one image per position by
      // zip order: a different echo here and there.
      const scan = phantomScan()
      const echo = (n) => scan.map((s) => ({...s, stack: `${n}|`}))
      expect(groupSeries([...echo(1), ...echo(2)]).map((s) => s.length)).toEqual([SLICES, SLICES])
    })
  })

  describe('dicomSeriesToNrrd', () => {
    it('stacks shuffled slices into an NRRD that three\'s NRRDLoader reads in HU, in patient space', () => {
      const [scan] = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      const volume = parseNrrd(dicomSeriesToNrrd(scan))
      expect(volume.dimensions).toEqual([COLUMNS, ROWS, SLICES])
      expect(volume.data).toBeInstanceOf(Int16Array)
      // The gap comes from the positions (2.5), not SliceThickness (3).
      expect(volume.spacing).toEqual([0.7, 0.8, 2.5])
      expect(volume.header.space).toBe('left-posterior-superior')
      expect(volume.header.space_origin.map(Number)).toEqual([-100, -80, 50])
      // A key/value pair (`modality:=CT`), filed by NRRDLoader with its `=`.
      expect(volume.header.modality).toBe('=CT')
      expect([volume.windowLow, volume.windowHigh]).toEqual([-1000, 2500])
      const at = (x, y, z) => volume.data[x + (y * COLUMNS) + (z * COLUMNS * ROWS)]
      expect(at(0, 0, 0)).toBe(-1000)
      expect(at(19, 23, 15)).toBe(40)
      // The sphere is right of centre along the row direction, so slice
      // order and the i axis are both as the scanner wrote them.
      expect(at(25, 23, 15)).toBe(2500)
      expect(at(13, 23, 15)).toBe(40)
    })

    it('reads the same volume from implicit and explicit VR', () => {
      const stack = (zip) => dicomSeriesToNrrd(groupSeries(sliceFilesOf(zip).map(parseDicomSlice))[0])
      expect(Buffer.from(stack('phantom-ct-implicit-vr.zip')).equals(Buffer.from(stack('phantom-ct.zip')))).toBe(true)
    })

    it('orders by position along the normal, not instance number, and drops a repeated slice', () => {
      const [scan] = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      const misnumbered = scan.map((s, k) => ({...s, instanceNumber: SLICES - k}))
      const volume = parseNrrd(dicomSeriesToNrrd([...misnumbered, misnumbered[3]]))
      expect(volume.dimensions[2]).toBe(SLICES)
      expect(volume.header.space_origin.map(Number)).toEqual([-100, -80, 50])
    })

    it('writes float when the rescale is not integral', () => {
      const [scan] = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      const volume = parseNrrd(dicomSeriesToNrrd(scan.map((s) => ({...s, slope: 0.5}))))
      expect(volume.data).toBeInstanceOf(Float32Array)
      expect(volume.data[0]).toBe(((-1000 + 1024) * 0.5) - 1024)
    })

    it('writes ushort for an unsigned range past what a short holds, float past that', () => {
      const scan = phantomScan()
      // Stored values run 24 (air) to 3524 (the sphere).
      const tenfold = parseNrrd(dicomSeriesToNrrd(scan.map((s) => ({...s, slope: 10, intercept: 0}))))
      expect(tenfold.data).toBeInstanceOf(Uint16Array)
      expect(tenfold.windowHigh).toBe(35240)
      const past = parseNrrd(dicomSeriesToNrrd(scan.map((s) => ({...s, slope: 20, intercept: 0}))))
      expect(past.data).toBeInstanceOf(Float32Array)
      expect(past.windowHigh).toBe(70480)
      // Negative and past 32767: neither short nor ushort holds it.
      const both = parseNrrd(dicomSeriesToNrrd(scan.map((s) => ({...s, slope: 10, intercept: -1024}))))
      expect(both.data).toBeInstanceOf(Float32Array)
    })

    it('keeps a gantry tilt: the slice axis is the position step, not the normal', () => {
      // Each slice 0.5 mm further posterior as well as 2.5 mm up.
      const tilted = phantomScan().map((s) => {
        const [x, y, z] = s.position
        return {...s, position: [x, y + (0.2 * (z - 50)), z]}
      })
      const volume = parseNrrd(dicomSeriesToNrrd(tilted))
      expect(volume.header.vectors[2][0]).toBeCloseTo(0, 6)
      expect(volume.header.vectors[2][1]).toBeCloseTo(0.5, 6)
      expect(volume.header.vectors[2][2]).toBeCloseTo(2.5, 6)
    })

    it('stacks a sagittal series along its own normal', () => {
      // Rows run anterior to posterior (+y), columns superior to inferior
      // (-z), so the normal row × column is -x (toward the patient's right),
      // and positions step that way.
      const sagittal = phantomScan().map((s) => ({
        ...s,
        orientation: [0, 1, 0, 0, 0, -1],
        position: [-(s.position[2] - 50), -80, 50],
      }))
      const volume = parseNrrd(dicomSeriesToNrrd(sagittal))
      const v = volume.header.vectors.map((d) => d.map((c) => Number(c.toFixed(6)) + 0))
      expect(v).toEqual([[0, 0.7, 0], [0, 0, -0.8], [-2.5, 0, 0]])
    })

    it('refuses a series with a slice missing, rather than stack it evenly', () => {
      const scan = phantomScan()
      expect(() => dicomSeriesToNrrd(scan.filter((s) => s.position[2] !== 50 + (2.5 * 10))))
        .toThrow(/unevenly spaced \(a slice may be missing\)/)
    })

    it('refuses slices with nothing to order them by', () => {
      const unordered = phantomScan().map((s) => ({...s, position: null, instanceNumber: null}))
      expect(() => dicomSeriesToNrrd(unordered)).toThrow(/no position or number/)
    })

    it('refuses slices of different sizes', () => {
      const [scan] = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      expect(() => dicomSeriesToNrrd([...scan, {...scan[0], rows: 16}])).toThrow(/differ in size/)
    })
  })
})
