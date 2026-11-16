/* eslint-disable no-magic-numbers */
// The DICOM reader and series stacker, over slices written by pydicom
// (`tools/models/makeDicomPhantom.py`, an independent writer) and, for the
// refusals, over minimal files built here.
import fs from 'fs'
import path from 'path'
import {NRRDLoader} from 'three/examples/jsm/loaders/NRRDLoader.js'
import {unzipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {DicomError, dicomSeriesToNrrd, groupSeries, looksLikeDicom, parseDicomSlice} from './dicom'


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


/**
 * One explicit-VR-little-endian element.
 *
 * @param {number} group
 * @param {number} element
 * @param {string} vr
 * @param {Uint8Array|string|number} value a string is padded to even length
 * @return {Uint8Array}
 */
function el(group, element, vr, value) {
  let bytes
  if (typeof value === 'number') {
    bytes = new Uint8Array(new Uint16Array([value]).buffer)
  } else if (typeof value === 'string') {
    bytes = new TextEncoder().encode(value.length % 2 ? `${value} ` : value)
  } else {
    bytes = value
  }
  const isLong = ['OB', 'OW', 'SQ', 'UN', 'UT'].includes(vr)
  const head = new DataView(new ArrayBuffer(isLong ? 12 : 8))
  head.setUint16(0, group, true)
  head.setUint16(2, element, true)
  head.setUint8(4, vr.charCodeAt(0))
  head.setUint8(5, vr.charCodeAt(1))
  if (isLong) {
    head.setUint32(8, bytes.length, true)
  } else {
    head.setUint16(6, bytes.length, true)
  }
  return concat([new Uint8Array(head.buffer), bytes])
}


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
 * A one-slice DICOM file, explicit VR LE unless `transferSyntax` says
 * otherwise, with `overrides` replacing the default image elements.
 *
 * @param {object} [opts]
 * @param {string} [opts.transferSyntax]
 * @param {object} [opts.overrides] keyed `gggg,eeee` → element bytes, or null to drop
 * @return {Uint8Array}
 */
function makeDicom({transferSyntax = '1.2.840.10008.1.2.1', overrides = {}} = {}) {
  const image = {
    '0028,0002': el(0x0028, 0x0002, 'US', 1),
    '0028,0010': el(0x0028, 0x0010, 'US', 2),
    '0028,0011': el(0x0028, 0x0011, 'US', 2),
    '0028,0100': el(0x0028, 0x0100, 'US', 16),
    '0028,0103': el(0x0028, 0x0103, 'US', 1),
    '7fe0,0010': el(0x7fe0, 0x0010, 'OW', new Uint8Array(new Int16Array([1, 2, 3, 4]).buffer)),
    ...overrides,
  }
  return concat([
    new Uint8Array(128),
    new TextEncoder().encode('DICM'),
    el(0x0002, 0x0010, 'UI', transferSyntax),
    el(0x0008, 0x0060, 'CS', 'CT'),
    el(0x0020, 0x000e, 'UI', '1.2.3'),
    ...Object.keys(image).sort().map((k) => image[k]).filter(Boolean),
  ])
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
      'reads geometry, rescale and pixels from pydicom\'s %s, past a nested sequence', (zip) => {
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
      // Into an element's header, and into one's value.
      expect(() => parseDicomSlice(whole.subarray(0, whole.length - 45))).toThrow(/damaged/)
      expect(() => parseDicomSlice(whole.subarray(0, whole.length - 49))).toThrow(/damaged/)
      // Into the pixels: the image is there, short.
      expect(() => parseDicomSlice(whole.subarray(0, whole.length - 2))).toThrow(/cut short/)
    })
  })

  describe('groupSeries', () => {
    it('puts the scan first and the scout after it', () => {
      const series = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      expect(series.map((s) => s.length)).toEqual([SLICES, 1])
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
      // Not `=C`: NRRDLoader cuts the header's last character.
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

    it('writes float rather than wrap an unsigned scan past what a short holds', () => {
      const [scan] = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      const volume = parseNrrd(dicomSeriesToNrrd(scan.map((s) => ({...s, slope: 10, intercept: 0}))))
      expect(volume.data).toBeInstanceOf(Float32Array)
      expect(volume.windowHigh).toBe((2500 + 1024) * 10)
    })

    it('refuses slices of different sizes', () => {
      const [scan] = groupSeries(sliceFilesOf('phantom-ct.zip').map(parseDicomSlice))
      expect(() => dicomSeriesToNrrd([...scan, {...scan[0], rows: 16}])).toThrow(/differ in size/)
    })
  })
})
