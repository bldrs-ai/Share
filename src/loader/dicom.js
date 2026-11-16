// DICOM slice series → one NRRD volume.
//
// A CT or MR study usually leaves the scanner as a folder of DICOM files,
// one per slice, and reaches users zipped. Share renders volumes through
// three's NRRDLoader (`loader/nrrd.js`), so this module turns a series of
// slices into the single `.nrrd` that loader reads: the archive seam
// (`modelArchive.js`) calls it on a zip that holds slices and no other
// model, and everything downstream only ever sees an NRRD.
//
// The reader is deliberately small. It reads what stacking slices needs —
// geometry (rows, columns, pixel spacing, position, orientation), the pixel
// format and the rescale to real units — and skips everything else, nested
// sequences included. It reads the uncompressed transfer syntaxes (implicit
// and explicit VR little endian), which is what scanners and PACS exports
// write by default. A compressed series (JPEG, JPEG 2000, RLE, deflate) is
// refused with a message, not decoded: there is no small browser decoder
// for those, and a wrong volume is worse than a clear "can't".
//
// Design: design/new/adding-model-formats.md §"A DICOM series becomes one
// NRRD".


// A binary codec: offsets, tag numbers and value ranges are the format's,
// named where a name helps and literal where the spec's layout is the name.
/* eslint-disable no-magic-numbers */
/** A DICOM file or series Share can't turn into a volume, with why. */
export class DicomError extends Error {
  /** @param {string} message user-facing; never names a file */
  constructor(message) {
    super(message)
    this.name = 'DicomError'
  }
}


// Part 10 files open with a 128-byte preamble, then "DICM".
const PREAMBLE_BYTES = 128
const DICM_MAGIC = [0x44, 0x49, 0x43, 0x4d]

const IMPLICIT_VR_LE = '1.2.840.10008.1.2'
const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'

// Explicit-VR elements whose length is a 4-byte field after 2 reserved
// bytes (PS3.5 §7.1.2); every other VR has a 2-byte length.
const LONG_LENGTH_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV'])

const UNDEFINED_LENGTH = 0xffffffff

// Tags as (group << 16 | element). Only these are kept.
const TAG = Object.freeze({
  TRANSFER_SYNTAX: 0x00020010,
  SOP_CLASS: 0x00080016,
  MODALITY: 0x00080060,
  SLICE_THICKNESS: 0x00180050,
  SERIES_UID: 0x0020000e,
  INSTANCE_NUMBER: 0x00200013,
  IMAGE_POSITION: 0x00200032,
  IMAGE_ORIENTATION: 0x00200037,
  SAMPLES_PER_PIXEL: 0x00280002,
  NUMBER_OF_FRAMES: 0x00280008,
  ROWS: 0x00280010,
  COLUMNS: 0x00280011,
  PIXEL_SPACING: 0x00280030,
  BITS_ALLOCATED: 0x00280100,
  PIXEL_REPRESENTATION: 0x00280103,
  RESCALE_INTERCEPT: 0x00281052,
  RESCALE_SLOPE: 0x00281053,
  PIXEL_DATA: 0x7fe00010,
})

const KEPT_TAGS = new Set(Object.values(TAG))

// Item, item delimiter and sequence delimiter (group FFFE) — the structure
// of a sequence, which is skipped over, not read.
const ITEM = 0xfffee000
const ITEM_DELIMITER = 0xfffee00d
const SEQUENCE_DELIMITER = 0xfffee0dd


/**
 * Whether these bytes are a DICOM Part 10 file: the 128-byte preamble then
 * `DICM`. Files written without the preamble (ACR-NEMA, some old exports)
 * aren't recognized; they are rare and have nothing reliable to sniff.
 *
 * @param {Uint8Array} bytes the file, or at least its first 132 bytes
 * @return {boolean}
 */
export function looksLikeDicom(bytes) {
  if (!bytes || bytes.length < PREAMBLE_BYTES + DICM_MAGIC.length) {
    return false
  }
  return DICM_MAGIC.every((b, i) => bytes[PREAMBLE_BYTES + i] === b)
}


/**
 * One DICOM image, as far as stacking it into a volume needs.
 *
 * @typedef {object} DicomSlice
 * @property {string} seriesUid SeriesInstanceUID
 * @property {string} modality e.g. `CT`, `MR`, or '' when absent
 * @property {number} rows image height, pixels
 * @property {number} columns image width, pixels
 * @property {Array<number>} pixelSpacing [between rows, between columns], mm
 * @property {number|null} sliceThickness mm
 * @property {Array<number>|null} position ImagePositionPatient, mm, LPS
 * @property {Array<number>} orientation ImageOrientationPatient: row then
 *   column direction cosines
 * @property {number|null} instanceNumber InstanceNumber, the fallback order
 * @property {number} bitsAllocated 8 or 16
 * @property {boolean} isSigned PixelRepresentation 1
 * @property {number} slope RescaleSlope
 * @property {number} intercept RescaleIntercept
 * @property {Uint8Array} pixelData the frame's raw bytes, little endian
 */


/**
 * Read a DICOM Part 10 file's slice geometry and pixels.
 *
 * @param {Uint8Array} bytes
 * @return {DicomSlice|null} null for a DICOM file that isn't an image (a
 *   DICOMDIR, a structured report, a presentation state)
 * @throws {DicomError} for an image Share can't read
 */
export function parseDicomSlice(bytes) {
  if (!looksLikeDicom(bytes)) {
    throw new DicomError('This is not a DICOM file.')
  }
  const elements = readElements(bytes)
  const transferSyntax = elements.get(TAG.TRANSFER_SYNTAX) ?? IMPLICIT_VR_LE
  if (!elements.has(TAG.PIXEL_DATA)) {
    return null
  }
  if (transferSyntax !== IMPLICIT_VR_LE && transferSyntax !== EXPLICIT_VR_LE) {
    throw new DicomError(
      `This DICOM series is compressed (transfer syntax ${ transferSyntax }), which Share can't decode. ` +
      `Export it uncompressed from your viewer or PACS, then open that.`)
  }
  const samples = numberOf(elements.get(TAG.SAMPLES_PER_PIXEL)) ?? 1
  if (samples !== 1) {
    throw new DicomError('This DICOM series is in color. Share opens grayscale scans (CT, MR, PET) only.')
  }
  const frames = numberOf(elements.get(TAG.NUMBER_OF_FRAMES)) ?? 1
  if (frames > 1) {
    throw new DicomError('This DICOM file holds a multi-frame image. Share opens series of single-frame slices only.')
  }
  const rows = numberOf(elements.get(TAG.ROWS))
  const columns = numberOf(elements.get(TAG.COLUMNS))
  const bitsAllocated = numberOf(elements.get(TAG.BITS_ALLOCATED)) ?? 16
  if (!rows || !columns) {
    throw new DicomError('A DICOM slice in this series has no image size.')
  }
  if (bitsAllocated !== 8 && bitsAllocated !== 16) {
    throw new DicomError(`This DICOM series stores ${bitsAllocated}-bit pixels. Share opens 8- and 16-bit scans.`)
  }
  const pixelData = elements.get(TAG.PIXEL_DATA)
  const frameBytes = rows * columns * (bitsAllocated / 8)
  if (pixelData.length < frameBytes) {
    throw new DicomError('A DICOM slice in this series is cut short: its pixels are missing.')
  }
  const orientation = numbersOf(elements.get(TAG.IMAGE_ORIENTATION))
  const spacing = numbersOf(elements.get(TAG.PIXEL_SPACING))
  const position = numbersOf(elements.get(TAG.IMAGE_POSITION))
  return {
    seriesUid: elements.get(TAG.SERIES_UID) ?? '',
    modality: elements.get(TAG.MODALITY) ?? '',
    rows,
    columns,
    pixelSpacing: spacing?.length === 2 && spacing.every((s) => s > 0) ? spacing : [1, 1],
    sliceThickness: positiveOrNull(numberOf(elements.get(TAG.SLICE_THICKNESS))),
    position: position?.length === 3 ? position : null,
    orientation: orientation?.length === 6 ? orientation : [1, 0, 0, 0, 1, 0],
    instanceNumber: numberOf(elements.get(TAG.INSTANCE_NUMBER)),
    bitsAllocated,
    isSigned: numberOf(elements.get(TAG.PIXEL_REPRESENTATION)) === 1,
    slope: numberOf(elements.get(TAG.RESCALE_SLOPE)) || 1,
    intercept: numberOf(elements.get(TAG.RESCALE_INTERCEPT)) ?? 0,
    pixelData: pixelData.subarray(0, frameBytes),
  }
}


/**
 * Group slices by series, largest first. A study export often carries a
 * scout (localizer) series of a few slices beside the scan itself; the
 * scan is the one with the most slices.
 *
 * @param {Array<DicomSlice>} slices
 * @return {Array<Array<DicomSlice>>}
 */
export function groupSeries(slices) {
  const bySeries = new Map()
  for (const slice of slices) {
    const key = seriesKey(slice)
    if (!bySeries.has(key)) {
      bySeries.set(key, [])
    }
    bySeries.get(key).push(slice)
  }
  return [...bySeries.values()].sort((a, b) => b.length - a.length)
}


/**
 * A slice's series, split further by image size and orientation: a series
 * UID is supposed to mean one stack, but some exports reuse it across
 * reformats, and those can't share a volume.
 *
 * @param {DicomSlice} slice
 * @return {string}
 */
function seriesKey(slice) {
  const orientation = slice.orientation.map((c) => c.toFixed(3)).join(',')
  return `${slice.seriesUid}|${slice.rows}x${slice.columns}|${orientation}`
}


/**
 * Stack one series' slices into an NRRD file: a `short` (or, when the
 * rescale isn't integral, `float`) volume in real units — Hounsfield for CT
 * — in DICOM's own patient space (`left-posterior-superior`), with the
 * slices' spacing, orientation and origin in `space directions` and
 * `space origin`, so NRRDLoader places it as the scanner did.
 *
 * Slices are ordered along the slice normal (row × column direction) by
 * their ImagePositionPatient, which is the only order DICOM guarantees;
 * InstanceNumber is the fallback for slices that have no position. The
 * gap between slices comes from those positions, not SliceThickness, which
 * is the thickness of the cut and differs from the gap for overlapping or
 * gapped reconstructions.
 *
 * @param {Array<DicomSlice>} slices one series, any order
 * @return {Uint8Array} the `.nrrd` file's bytes
 * @throws {DicomError}
 */
export function dicomSeriesToNrrd(slices) {
  if (slices.length === 0) {
    throw new DicomError('This DICOM series has no slices.')
  }
  const first = slices[0]
  const {rows, columns, orientation} = first
  for (const s of slices) {
    if (s.rows !== rows || s.columns !== columns || s.bitsAllocated !== first.bitsAllocated) {
      throw new DicomError('The slices in this DICOM series differ in size, so they don\'t stack into one volume.')
    }
  }
  const rowDir = orientation.slice(0, 3)
  const colDir = orientation.slice(3, 6)
  const normal = normalize(cross(rowDir, colDir))
  const ordered = orderSlices(slices, normal)
  const sliceGap = sliceSpacing(ordered, normal)

  // PixelSpacing is [row spacing, column spacing]: the gap between rows
  // runs along the column direction, and between columns along the row
  // direction. NRRD's first (fastest) axis is the column index i, which
  // steps along the row direction.
  const [rowSpacing, colSpacing] = first.pixelSpacing
  const directions = [
    scale(rowDir, colSpacing),
    scale(colDir, rowSpacing),
    scale(normal, sliceGap),
  ]
  const origin = ordered[0].position ?? [0, 0, 0]

  const voxelsPerSlice = rows * columns
  const raws = ordered.map(rawPixels)
  // `short` when every slice's rescale is integral and its rescaled range
  // fits — CT's Hounsfield units always do — else `float`, rather than wrap
  // an unsigned 16-bit scan's brightest voxels negative.
  const isShort = ordered.every((s, k) => {
    if (!Number.isInteger(s.slope) || !Number.isInteger(s.intercept)) {
      return false
    }
    const [lo, hi] = minMax(raws[k])
    const ends = [(lo * s.slope) + s.intercept, (hi * s.slope) + s.intercept]
    return ends.every((v) => v >= -32768 && v <= 32767)
  })
  const header = `${[
    'NRRD0004',
    '# Converted by Bldrs Share from a DICOM series',
    `type: ${isShort ? 'short' : 'float'}`,
    'dimension: 3',
    'space: left-posterior-superior',
    `sizes: ${columns} ${rows} ${ordered.length}`,
    `space directions: ${directions.map(vectorStr).join(' ')}`,
    'kinds: domain domain domain',
    'endian: little',
    'encoding: raw',
    `space origin: ${vectorStr(origin)}`,
    // NRRD key/value pairs (`key:=value`), which NRRDLoader keeps on
    // `volume.header` for `nrrd.js` to pick a default window by.
    `modality:=${sanitizeKeyValue(first.modality)}`,
    // Last, and a comment, because NRRDLoader cuts the header one character
    // short of the blank line that ends it (`_parseChars(_bytes, 0, i - 2)`
    // in three r184): a field here would lose its last character. Read
    // through NRRDLoader, `modality:=CT` above came back as `=C`.
    '# end of header',
  ].join('\n') }\n\n`
  // The voxels are written straight into the file, after the header, rather
  // than into an array that is then copied in: for a 400-slice CT that copy
  // is another ~200 MiB held at once. A typed-array view needs its offset
  // aligned to its element size, so the header is padded with spaces at the
  // end of its last (comment) line.
  const voxelBytes = isShort ? 2 : 4
  const unpadded = new TextEncoder().encode(header)
  const padding = (voxelBytes - ((unpadded.length) % voxelBytes)) % voxelBytes
  const headerBytes = new TextEncoder().encode(header.replace(/\n\n$/, `${' '.repeat(padding)}\n\n`))
  const count = voxelsPerSlice * ordered.length
  const file = new Uint8Array(headerBytes.length + (count * voxelBytes))
  file.set(headerBytes, 0)
  const out = isShort ?
    new Int16Array(file.buffer, headerBytes.length, count) :
    new Float32Array(file.buffer, headerBytes.length, count)
  ordered.forEach((slice, k) => {
    const raw = raws[k]
    const base = k * voxelsPerSlice
    for (let v = 0; v < voxelsPerSlice; v++) {
      out[base + v] = (raw[v] * slice.slope) + slice.intercept
    }
  })
  return file
}


/**
 * @param {Array<DicomSlice>} slices
 * @param {Array<number>} normal
 * @return {Array<DicomSlice>} sorted along the normal, duplicates dropped
 */
function orderSlices(slices, normal) {
  const hasPositions = slices.every((s) => s.position !== null)
  const key = hasPositions ?
    (s) => dot(s.position, normal) :
    (s) => s.instanceNumber ?? 0
  const sorted = [...slices].sort((a, b) => key(a) - key(b))
  // The same slice twice (an export that wrote it under two names, or two
  // echoes at one position) would double a plane of the volume and push
  // everything after it out of place.
  return sorted.filter((s, i) => i === 0 || Math.abs(key(s) - key(sorted[i - 1])) > 1e-4)
}


/**
 * The gap between neighbouring slices along the normal, mm: the median of
 * their position differences, so one missing slice doesn't stretch the
 * whole volume. SliceThickness, then 1, for a series without positions.
 *
 * @param {Array<DicomSlice>} ordered
 * @param {Array<number>} normal
 * @return {number}
 */
function sliceSpacing(ordered, normal) {
  if (ordered.length > 1 && ordered.every((s) => s.position !== null)) {
    const gaps = []
    for (let k = 1; k < ordered.length; k++) {
      gaps.push(dot(ordered[k].position, normal) - dot(ordered[k - 1].position, normal))
    }
    gaps.sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)]
    if (median > 0) {
      return median
    }
  }
  return ordered[0].sliceThickness ?? 1
}


/**
 * @param {Array<number>|Int16Array|Uint8Array|Uint16Array|Int8Array} values
 * @return {Array<number>} [min, max]
 */
function minMax(values) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v < lo) {
      lo = v
    }
    if (v > hi) {
      hi = v
    }
  }
  return [lo, hi]
}


/**
 * @param {DicomSlice} slice
 * @return {Uint8Array|Int8Array|Uint16Array|Int16Array} its stored values
 */
function rawPixels(slice) {
  const {pixelData, bitsAllocated, isSigned} = slice
  if (bitsAllocated === 8) {
    return isSigned ? new Int8Array(pixelData.buffer, pixelData.byteOffset, pixelData.length) : pixelData
  }
  const count = pixelData.length / 2
  // A 16-bit view needs an even offset; the pixel data's offset in its file
  // is whatever the elements before it made it, so copy when it's odd.
  const aligned = pixelData.byteOffset % 2 === 0 ? pixelData : pixelData.slice()
  return isSigned ?
    new Int16Array(aligned.buffer, aligned.byteOffset, count) :
    new Uint16Array(aligned.buffer, aligned.byteOffset, count)
}


/**
 * Walk a Part 10 file's elements, keeping the values of {@link KEPT_TAGS}.
 *
 * The file meta group (0002) is always explicit VR little endian; the
 * dataset after it is in the transfer syntax the meta group names. Values
 * are strings (trailing padding trimmed) or, for US and the pixel data, the
 * raw form: a number, or the bytes.
 *
 * @param {Uint8Array} bytes
 * @return {Map<number, any>}
 * @throws {DicomError}
 */
function readElements(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const elements = new Map()
  const reader = {view, bytes, offset: PREAMBLE_BYTES + DICM_MAGIC.length, explicit: true}
  try {
    while (reader.offset + 8 <= bytes.length) {
      const group = view.getUint16(reader.offset, true)
      if (group !== 0x0002 && reader.isMetaDone !== true) {
        reader.isMetaDone = true
        reader.explicit = (elements.get(TAG.TRANSFER_SYNTAX) ?? IMPLICIT_VR_LE) !== IMPLICIT_VR_LE
      }
      const element = readElement(reader)
      if (element.tag === TAG.PIXEL_DATA) {
        if (element.length === UNDEFINED_LENGTH) {
          // Encapsulated (compressed) pixel data. The transfer syntax check
          // reports it; mark it present so that check runs.
          elements.set(TAG.PIXEL_DATA, new Uint8Array(0))
        } else {
          elements.set(TAG.PIXEL_DATA, bytes.subarray(element.valueOffset, element.valueOffset + element.length))
        }
        break
      }
      if (KEPT_TAGS.has(element.tag)) {
        elements.set(element.tag, decodeValue(reader, element))
      }
    }
    if (!elements.has(TAG.PIXEL_DATA) && reader.offset < bytes.length) {
      // Bytes left over that don't make an element: the file was cut off.
      throw new RangeError('trailing partial element')
    }
  } catch (e) {
    if (e instanceof RangeError) {
      throw new DicomError('A DICOM file in this series is damaged: its elements run past its end.')
    }
    throw e
  }
  return elements
}


/**
 * One element's header: where its value is, not the value.
 *
 * @typedef {object} DicomElement
 * @property {number} tag (group << 16 | element)
 * @property {string|null} vr null in implicit VR
 * @property {number} length the value's length, or 0xFFFFFFFF for undefined
 * @property {number} valueOffset where the value starts in the file
 */


/**
 * Read one element header and step past its value (a sequence of undefined
 * length is walked to its delimiter).
 *
 * @param {object} reader
 * @return {DicomElement}
 */
function readElement(reader) {
  const {view} = reader
  const start = reader.offset
  const group = view.getUint16(start, true)
  const elem = view.getUint16(start + 2, true)
  const tag = ((group << 16) | elem) >>> 0
  let vr = null
  let length
  let valueOffset
  // Item and delimiter tags carry no VR in either syntax.
  const isStructural = group === 0xfffe
  if (reader.explicit && !isStructural) {
    vr = String.fromCharCode(view.getUint8(start + 4), view.getUint8(start + 5))
    if (LONG_LENGTH_VRS.has(vr)) {
      length = view.getUint32(start + 8, true)
      valueOffset = start + 12
    } else {
      length = view.getUint16(start + 6, true)
      valueOffset = start + 8
    }
  } else {
    length = view.getUint32(start + 4, true)
    valueOffset = start + 8
  }
  reader.offset = valueOffset
  if (tag === TAG.PIXEL_DATA) {
    return {tag, vr, length, valueOffset}
  }
  if (length === UNDEFINED_LENGTH) {
    // A sequence (or, in implicit VR, an element of unknown VR that must be
    // one) of undefined length: skip nested items to the delimiter.
    skipUndefinedLength(reader)
  } else {
    if (valueOffset + length > reader.bytes.length) {
      throw new RangeError('element past end')
    }
    reader.offset = valueOffset + length
  }
  return {tag, vr, length, valueOffset}
}


/**
 * Step past the items of an undefined-length sequence, up to and including
 * its sequence delimiter. Items of undefined length are walked element by
 * element to their item delimiter, recursing into nested sequences.
 *
 * @param {object} reader
 */
function skipUndefinedLength(reader) {
  while (reader.offset + 8 <= reader.bytes.length) {
    const element = readElement(reader)
    if (element.tag === SEQUENCE_DELIMITER || element.tag === ITEM_DELIMITER) {
      return
    }
    if (element.tag === ITEM && element.length === UNDEFINED_LENGTH) {
      // readElement already walked it, via the recursion above.
      continue
    }
  }
  throw new RangeError('sequence past end')
}


/**
 * @param {object} reader
 * @param {DicomElement} element
 * @return {string|number}
 */
function decodeValue(reader, element) {
  const {view, bytes} = reader
  // The binary integers among the kept tags (Rows, Columns, BitsAllocated,
  // SamplesPerPixel, PixelRepresentation) are US: in implicit VR there is no
  // VR to say so, but their tags do.
  const isUs = element.vr === 'US' || (element.vr === null && isUsTag(element.tag))
  if (isUs && element.length >= 2) {
    return view.getUint16(element.valueOffset, true)
  }
  const raw = bytes.subarray(element.valueOffset, element.valueOffset + element.length)

  return new TextDecoder('latin1').decode(raw).replace(/[\0\s]+$/, '').trim()
}


/**
 * @param {number} tag
 * @return {boolean} whether the tag's VR is US by the dictionary
 */
function isUsTag(tag) {
  return tag === TAG.SAMPLES_PER_PIXEL || tag === TAG.ROWS || tag === TAG.COLUMNS ||
    tag === TAG.BITS_ALLOCATED || tag === TAG.PIXEL_REPRESENTATION
}


/**
 * @param {string|number|undefined} value
 * @return {number|null} a number value, or the first of a `\`-separated
 *   string's; null when absent or not numeric
 */
function numberOf(value) {
  if (typeof value === 'number') {
    return value
  }
  const all = numbersOf(value)
  return all && all.length > 0 ? all[0] : null
}


/**
 * @param {string|number|undefined} value a DS/IS multi-value, `a\b\c`
 * @return {Array<number>|null}
 */
function numbersOf(value) {
  if (typeof value === 'number') {
    return [value]
  }
  if (typeof value !== 'string' || value === '') {
    return null
  }
  const parts = value.split('\\').map((v) => Number(v.trim()))
  return parts.every(Number.isFinite) ? parts : null
}


/**
 * @param {number|null} n
 * @return {number|null}
 */
function positiveOrNull(n) {
  return n !== null && n > 0 ? n : null
}


/**
 * A key/value pair's value in the NRRD header is one line of text.
 *
 * @param {string} s
 * @return {string}
 */
function sanitizeKeyValue(s) {
  return String(s).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 16)
}


/**
 * @param {Array<number>} v
 * @return {string} NRRD's `(x,y,z)`
 */
function vectorStr(v) {
  return `(${v.map((c) => Number(c.toPrecision(10))).join(',')})`
}


/**
 * @param {Array<number>} a
 * @param {Array<number>} b
 * @return {Array<number>}
 */
function cross(a, b) {
  return [(a[1] * b[2]) - (a[2] * b[1]), (a[2] * b[0]) - (a[0] * b[2]), (a[0] * b[1]) - (a[1] * b[0])]
}


/**
 * @param {Array<number>} a
 * @param {Array<number>} b
 * @return {number}
 */
function dot(a, b) {
  return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2])
}


/**
 * @param {Array<number>} v
 * @param {number} s
 * @return {Array<number>}
 */
function scale(v, s) {
  return v.map((c) => c * s)
}


/**
 * @param {Array<number>} v
 * @return {Array<number>} unit length; the slice axis when degenerate
 */
function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2])
  return len > 0 ? v.map((c) => c / len) : [0, 0, 1]
}
