// Reading a zip archive the user brought, entry by entry, without trusting
// what it says about itself (Share#2006).
//
// This module is the format: the central directory, a local file header, and
// the inflate of ONE entry under a ceiling. Which entry is the model, and
// what the user is told, is `modelArchive.js`'s. Design:
// design/new/adding-model-formats.md §"An archive is not a format either".
//
// Why a reader of our own rather than fflate's `unzipSync`, which three
// already vendors and `Filetype.js` already imports from:
//
//   - `unzipSync` takes the whole archive as one Uint8Array. A 2 GB download
//     bundle with a 20 MB model in it would be read into memory to find that
//     model. Here the directory is read from the tail of the Blob and only the
//     chosen entry's compressed bytes are ever sliced out.
//   - It allocates `new Uint8Array(declaredSize)` from the central directory
//     before inflating — a 200-byte zip that declares 4 GiB asks the tab for
//     4 GiB — and it does not report an entry that inflates to more or less
//     than it declared. The ceiling below has to be enforced on what comes out
//     of the inflate, so the inflate has to be ours to count.
//
// The inflate itself is still fflate's (`Inflate`, the streaming class), so
// this adds no dependency and no bundle weight.
import {Inflate} from 'three/examples/jsm/libs/fflate.module.js'
import {isOutOfMemoryError} from '../utils/oom'
import {MAX_INFLATED_BYTES} from './gzipEnvelope'


/**
 * The most one entry may inflate to: the gzip envelope's ceiling, for the
 * same reason (`gzipEnvelope.js`) — at the far end of what a browser hands
 * out as one ArrayBuffer, and ~8× the largest model measured.
 */
export const MAX_ENTRY_INFLATED_BYTES = MAX_INFLATED_BYTES


/**
 * The most one upload may inflate in total, across every entry it opens.
 * An upload opens one entry, except a `.ifczip` inside a `.zip`, which
 * inflates the `.ifczip` and then the `.ifc` inside it while both are held.
 * The ceiling is the same 512 MiB: whatever one drop or pick inflates has to
 * fit where one model is allowed to.
 */
export const MAX_TOTAL_INFLATED_BYTES = MAX_INFLATED_BYTES


// A central directory past this is not one a person made by zipping some
// files: at ~80 bytes a record it is ~800k entries. Refused rather than read,
// since reading it is a single allocation of its declared size.
const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB
const MAX_DIRECTORY_MIB = 64
const MAX_DIRECTORY_BYTES = MAX_DIRECTORY_MIB * BYTES_PER_MIB


// Input fed to the inflater per push. Deflate expands at most ~1032:1, so one
// push can produce at most ~16.5 MiB before the count below sees it: the
// ceiling overshoots by that at worst, never by the bomb's full expansion.
const INFLATE_INPUT_KIB = 16
const INFLATE_INPUT_CHUNK = INFLATE_INPUT_KIB * BYTES_PER_KIB
// Hand the event loop back this often (in input bytes), so a large entry
// inflating on the main thread doesn't freeze the page for its whole length.
const YIELD_EVERY_INPUT_BYTES = 4 * BYTES_PER_MIB


// Record signatures, little-endian ("PK" then two bytes).
const SIG_LOCAL_HEADER = 0x04034b50
const SIG_CENTRAL_HEADER = 0x02014b50
const SIG_END_OF_DIRECTORY = 0x06054b50
const SIG_ZIP64_LOCATOR = 0x07064b50
const SIG_ZIP64_END_OF_DIRECTORY = 0x06064b50

// End-of-central-directory record: fixed part, and how far before the end of
// the file it can start (a comment of up to 65535 bytes follows it).
const EOCD_BYTES = 22
const EOCD_MAX_COMMENT = 0xffff
const EOCD_DISK = 4
const EOCD_DIRECTORY_DISK = 6
const EOCD_ENTRY_COUNT = 10
const EOCD_DIRECTORY_SIZE = 12
const EOCD_DIRECTORY_OFFSET = 16
// The zip64 locator sits immediately before the EOCD.
const ZIP64_LOCATOR_BYTES = 20
const ZIP64_LOCATOR_EOCD_OFFSET = 8
const ZIP64_EOCD_BYTES = 56
const ZIP64_EOCD_DISK = 16
const ZIP64_EOCD_DIRECTORY_DISK = 20
const ZIP64_EOCD_ENTRY_COUNT = 32
const ZIP64_EOCD_DIRECTORY_SIZE = 40
const ZIP64_EOCD_DIRECTORY_OFFSET = 48

// Central directory file header.
const CDH_BYTES = 46
const CDH_FLAGS = 8
const CDH_METHOD = 10
const CDH_COMPRESSED_SIZE = 20
const CDH_SIZE = 24
const CDH_NAME_LENGTH = 28
const CDH_EXTRA_LENGTH = 30
const CDH_COMMENT_LENGTH = 32
const CDH_LOCAL_HEADER_OFFSET = 42

// Local file header.
const LFH_BYTES = 30
const LFH_NAME_LENGTH = 26
const LFH_EXTRA_LENGTH = 28

// A 16- or 32-bit field holding all ones means "see the zip64 record".
const U16_MAX = 0xffff
const U32_MAX = 0xffffffff
const ZIP64_EXTRA_ID = 0x0001
const EXTRA_HEADER_BYTES = 4
const U16_BYTES = 2
const U64_BYTES = 8

// General-purpose flag bits.
const FLAG_ENCRYPTED = 0x0001

// Compression methods: the two every zip tool writes by default, and the
// names of the others a user is likely to have, for the refusal.
const METHOD_STORED = 0
const METHOD_DEFLATED = 8
const METHOD_DEFLATE64 = 9
const METHOD_BZIP2 = 12
const METHOD_LZMA = 14
const METHOD_ZSTANDARD = 93
const METHOD_XZ = 95
const METHOD_AES = 99
const METHOD_NAMES = new Map([
  [METHOD_DEFLATE64, 'Deflate64'], [METHOD_BZIP2, 'bzip2'], [METHOD_LZMA, 'LZMA'],
  [METHOD_ZSTANDARD, 'Zstandard'], [METHOD_XZ, 'XZ'], [METHOD_AES, 'AES encryption'],
])


/**
 * Why an archive, or the entry asked for, cannot be opened. The message is
 * for the dialog: it never names a file, so it is safe as an alert's text
 * (string alerts are fingerprinted by their text, `utils/alertTracking.js`).
 */
export class ZipArchiveError extends Error {
  /** @param {string} msg */
  constructor(msg) {
    super(msg)
    this.name = 'ZipArchiveError'
  }
}


// Said for every structural fault: a missing or truncated directory, a record
// that runs off its end, an entry that inflates to other than it declared.
// The user's remedy is the same for all of them.
const DAMAGED_MESSAGE = 'This archive is damaged or incomplete, so Share can\'t read the model inside. ' +
  'Download it again, or unpack it and open the model directly.'


/** @return {string} The refusal for an entry past the ceiling */
function expandsPastMessage() {
  return `The model in this archive unpacks to more than ${MAX_ENTRY_INFLATED_BYTES / BYTES_PER_MIB} MiB, ` +
    'which is larger than any model Share can open.'
}


// An allocation the browser refused: the entry fit under the ceiling, but
// not in this tab's memory. Not an OOM-pattern message on purpose — the
// refusal is an expected outcome the dialog explains, as CadView's `oom`
// alert is, and is never reported as a defect.
const TOO_LARGE_FOR_DEVICE_MESSAGE = 'This model is too large to unpack in this browser. ' +
  'Unpack the archive and open the model directly, or try a desktop browser.'


/**
 * What a reader failure means to the user. A `ZipArchiveError` is already
 * that. An allocation failure is the device's limit. A `RangeError` from a
 * DataView or a typed-array length is a record whose numbers don't fit the
 * bytes: damage, whatever produced it. Anything else is not the archive's
 * fault and is left as it is, for the seam to report as a defect.
 *
 * @param {any} e
 * @return {any}
 */
function asArchiveError(e) {
  if (e instanceof ZipArchiveError) {
    return e
  }
  if (isOutOfMemoryError(e)) {
    return new ZipArchiveError(TOO_LARGE_FOR_DEVICE_MESSAGE)
  }
  if (e instanceof RangeError) {
    return new ZipArchiveError(DAMAGED_MESSAGE)
  }
  return e
}


/**
 * One file in an archive, as its central directory describes it. Sizes are
 * what the archive CLAIMS; {@link extractZipEntry} trusts them only to refuse
 * early, never to allow.
 *
 * @typedef {object} ZipEntry
 * @property {string} path Full path inside the archive, e.g. `export/Tower.ifc`
 * @property {string} name Last path segment, e.g. `Tower.ifc`
 * @property {string} ext Lowercased extension of `name`, or '' for none
 * @property {number} size Declared inflated size
 * @property {number} compressedSize Declared stored size
 * @property {number} method Compression method
 * @property {number} flags General-purpose bit flags
 * @property {number} localHeaderOffset Where the entry's local header starts
 */


/**
 * True when these bytes begin a zip archive: a local file header
 * (`PK\x03\x04`), or the end-of-directory record an empty archive is made of
 * alone (`PK\x05\x06`).
 *
 * @param {ArrayBuffer|Uint8Array} bytes the head of a file
 * @return {boolean}
 */
export function looksLikeZipBytes(bytes) {
  const view = ArrayBuffer.isView(bytes) ?
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) :
    new DataView(bytes)
  if (view.byteLength < 4) {
    return false
  }
  const sig = view.getUint32(0, true)
  return sig === SIG_LOCAL_HEADER || sig === SIG_END_OF_DIRECTORY
}


/**
 * The archive's files, from its central directory, in directory order.
 * Directories are left out (they hold nothing to open), and so is what
 * macOS's Finder adds to every zip it makes — `__MACOSX/` and `._name`
 * AppleDouble files, which carry a model's extension (`__MACOSX/._Tower.ifc`)
 * and are not models.
 *
 * Reads only the tail of the Blob and the directory itself.
 *
 * @param {Blob} blob
 * @return {Promise<Array<ZipEntry>>}
 * @throws {ZipArchiveError} when the directory is missing, damaged, split
 *   across files, or too large
 */
export async function readZipDirectory(blob) {
  try {
    return await readDirectory(blob)
  } catch (e) {
    throw asArchiveError(e)
  }
}


/**
 * {@link readZipDirectory}'s body, which may throw anything a malformed
 * archive can make a DataView or an allocation throw.
 *
 * @param {Blob} blob
 * @return {Promise<Array<ZipEntry>>}
 */
async function readDirectory(blob) {
  const {entryCount, directorySize, directoryOffset} = await readEndOfDirectory(blob)
  if (directorySize > MAX_DIRECTORY_BYTES) {
    throw new ZipArchiveError('This archive lists too many files to open.')
  }
  if (directoryOffset + directorySize > blob.size) {
    throw new ZipArchiveError(DAMAGED_MESSAGE)
  }
  const dir = new DataView(await blob.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer())
  const decoder = new TextDecoder('utf-8')
  const entries = []
  let at = 0
  for (let i = 0; i < entryCount; i++) {
    const record = at
    if (record + CDH_BYTES > dir.byteLength || dir.getUint32(record, true) !== SIG_CENTRAL_HEADER) {
      throw new ZipArchiveError(DAMAGED_MESSAGE)
    }
    const nameLength = dir.getUint16(record + CDH_NAME_LENGTH, true)
    const extraLength = dir.getUint16(record + CDH_EXTRA_LENGTH, true)
    const commentLength = dir.getUint16(record + CDH_COMMENT_LENGTH, true)
    const nameStart = record + CDH_BYTES
    const extraStart = nameStart + nameLength
    const next = extraStart + extraLength + commentLength
    if (next > dir.byteLength) {
      throw new ZipArchiveError(DAMAGED_MESSAGE)
    }
    // UTF-8 whether or not the archive sets the UTF-8 flag (bit 11). Without
    // it the spec says CP437, which agrees with UTF-8 on ASCII; a non-ASCII
    // name from an old tool shows garbled in the chooser, and an extension —
    // all that selection reads — is ASCII either way.
    // Backslashes as `/`: some Windows tools write `folder\model.ifc`, which
    // the spec forbids and every unzip reads as a folder anyway.
    const path = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + nameStart, nameLength))
      .replace(/\\/g, '/')
    const sizes = resolveZip64Sizes(dir, record, extraStart, extraLength)
    at = next
    if (path.endsWith('/') || isMacMetadata(path)) {
      continue
    }
    const name = path.slice(path.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    entries.push({
      path,
      name,
      ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
      size: sizes.size,
      compressedSize: sizes.compressedSize,
      method: dir.getUint16(record + CDH_METHOD, true),
      flags: dir.getUint16(record + CDH_FLAGS, true),
      localHeaderOffset: sizes.localHeaderOffset,
    })
  }
  return entries
}


/**
 * Inflate one entry, refusing — not truncating — past the ceiling.
 *
 * What the ceiling trusts: nothing the archive says about itself. The
 * entry's declared size is used twice, and neither use can let more bytes
 * out than the ceiling: (1) a declared size over the ceiling is refused
 * before anything is read; (2) under it, the declared size is the output
 * buffer, and the inflate is COUNTED as it runs — the first chunk that would
 * go past the declared size is an error, as is finishing short of it. So a
 * zip bomb whose header lies low stops at its lie (plus one push, ≤ ~16.5
 * MiB), and one whose header tells the truth is refused unread.
 *
 * @param {Blob} blob the archive
 * @param {ZipEntry} entry from {@link readZipDirectory}
 * @param {{remaining: number}} budget what this upload may still inflate;
 *   charged with what this entry actually produced
 * @return {Promise<Uint8Array>} the entry's bytes
 * @throws {ZipArchiveError}
 */
export async function extractZipEntry(blob, entry, budget) {
  try {
    return await extractEntry(blob, entry, budget)
  } catch (e) {
    throw asArchiveError(e)
  }
}


/**
 * {@link extractZipEntry}'s body.
 *
 * @param {Blob} blob
 * @param {ZipEntry} entry
 * @param {{remaining: number}} budget
 * @return {Promise<Uint8Array>}
 */
async function extractEntry(blob, entry, budget) {
  if (entry.flags & FLAG_ENCRYPTED) {
    throw new ZipArchiveError('This archive is password-protected. Unpack it first, then open the model inside.')
  }
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATED) {
    const method = METHOD_NAMES.get(entry.method) ?? `method ${entry.method}`
    throw new ZipArchiveError(
      `This archive is compressed with ${method}, which Share can't read. Unpack it first, then open the model inside.`)
  }
  const ceiling = Math.min(MAX_ENTRY_INFLATED_BYTES, budget.remaining)
  // The compressed size is bounded too: deflate never makes data much larger,
  // so a stored stream past the ceiling cannot inflate under it, and reading
  // it would be an allocation of that size.
  if (entry.size > ceiling || entry.compressedSize > ceiling) {
    throw new ZipArchiveError(expandsPastMessage())
  }
  const header = new DataView(await blob.slice(entry.localHeaderOffset, entry.localHeaderOffset + LFH_BYTES).arrayBuffer())
  if (header.byteLength < LFH_BYTES || header.getUint32(0, true) !== SIG_LOCAL_HEADER) {
    throw new ZipArchiveError(DAMAGED_MESSAGE)
  }
  // The local header's own name and extra lengths, not the directory's: they
  // are allowed to differ, and these are what sit in front of the data.
  const dataStart = entry.localHeaderOffset + LFH_BYTES +
    header.getUint16(LFH_NAME_LENGTH, true) + header.getUint16(LFH_EXTRA_LENGTH, true)
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > blob.size) {
    throw new ZipArchiveError(DAMAGED_MESSAGE)
  }
  const stored = new Uint8Array(await blob.slice(dataStart, dataEnd).arrayBuffer())
  let bytes
  if (entry.method === METHOD_STORED) {
    if (stored.length !== entry.size) {
      throw new ZipArchiveError(DAMAGED_MESSAGE)
    }
    bytes = stored
  } else {
    bytes = await inflateCounted(stored, entry.size)
  }
  budget.remaining -= bytes.length
  return bytes
}


/**
 * Raw-deflate `stored` into a buffer of exactly `expectedSize`, counting every
 * byte that comes out.
 *
 * @param {Uint8Array} stored the entry's compressed bytes
 * @param {number} expectedSize the declared size, already checked against
 *   the ceiling
 * @return {Promise<Uint8Array>}
 * @throws {ZipArchiveError} when the stream is corrupt, or inflates to any
 *   size other than `expectedSize`
 */
async function inflateCounted(stored, expectedSize) {
  const out = new Uint8Array(expectedSize)
  let written = 0
  const inflater = new Inflate((chunk) => {
    if (written + chunk.length > expectedSize) {
      throw new ZipArchiveError(DAMAGED_MESSAGE)
    }
    out.set(chunk, written)
    written += chunk.length
  })
  try {
    let at = 0
    let sinceYield = 0
    // do/while so an empty stream still gets its one final push. fflate
    // accepts an empty final push as a complete, empty stream, so that is no
    // error here; the size check below is what refuses it, unless the entry
    // declared 0 bytes (`modelArchive.js` never picks such an entry).
    do {
      const end = Math.min(at + INFLATE_INPUT_CHUNK, stored.length)
      inflater.push(stored.subarray(at, end), end === stored.length)
      sinceYield += end - at
      at = end
      if (sinceYield >= YIELD_EVERY_INPUT_BYTES && at < stored.length) {
        sinceYield = 0
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } while (at < stored.length)
  } catch (e) {
    if (e instanceof ZipArchiveError || isOutOfMemoryError(e)) {
      throw e
    }
    // fflate's own: invalid block type, unexpected EOF, a bad distance.
    throw new ZipArchiveError(DAMAGED_MESSAGE)
  }
  if (written !== expectedSize) {
    throw new ZipArchiveError(DAMAGED_MESSAGE)
  }
  return out
}


/**
 * The end-of-central-directory record, through its zip64 twin when the
 * classic one is saturated.
 *
 * @param {Blob} blob
 * @return {Promise<{entryCount: number, directorySize: number, directoryOffset: number}>}
 * @throws {ZipArchiveError}
 */
async function readEndOfDirectory(blob) {
  const tailStart = Math.max(0, blob.size - EOCD_BYTES - EOCD_MAX_COMMENT - ZIP64_LOCATOR_BYTES)
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer())
  // Backwards from the latest place it can start: the comment after it is
  // free text and could itself contain the signature.
  let eocd = -1
  for (let at = tail.byteLength - EOCD_BYTES; at >= 0; at--) {
    if (tail.getUint32(at, true) === SIG_END_OF_DIRECTORY) {
      eocd = at
      break
    }
  }
  if (eocd < 0) {
    throw new ZipArchiveError(DAMAGED_MESSAGE)
  }
  let disk = tail.getUint16(eocd + EOCD_DISK, true)
  let directoryDisk = tail.getUint16(eocd + EOCD_DIRECTORY_DISK, true)
  let entryCount = tail.getUint16(eocd + EOCD_ENTRY_COUNT, true)
  let directorySize = tail.getUint32(eocd + EOCD_DIRECTORY_SIZE, true)
  let directoryOffset = tail.getUint32(eocd + EOCD_DIRECTORY_OFFSET, true)
  const isSaturated = entryCount === U16_MAX || directorySize === U32_MAX || directoryOffset === U32_MAX
  const locator = eocd - ZIP64_LOCATOR_BYTES
  if (isSaturated && locator >= 0 && tail.getUint32(locator, true) === SIG_ZIP64_LOCATOR) {
    const recordOffset = readU64(tail, locator + ZIP64_LOCATOR_EOCD_OFFSET)
    const record = new DataView(await blob.slice(recordOffset, recordOffset + ZIP64_EOCD_BYTES).arrayBuffer())
    if (record.byteLength < ZIP64_EOCD_BYTES || record.getUint32(0, true) !== SIG_ZIP64_END_OF_DIRECTORY) {
      throw new ZipArchiveError(DAMAGED_MESSAGE)
    }
    disk = record.getUint32(ZIP64_EOCD_DISK, true)
    directoryDisk = record.getUint32(ZIP64_EOCD_DIRECTORY_DISK, true)
    entryCount = readU64(record, ZIP64_EOCD_ENTRY_COUNT)
    directorySize = readU64(record, ZIP64_EOCD_DIRECTORY_SIZE)
    directoryOffset = readU64(record, ZIP64_EOCD_DIRECTORY_OFFSET)
  }
  if (disk !== 0 || directoryDisk !== 0) {
    throw new ZipArchiveError(
      'This archive is split across several files (.z01, .z02, …). Join and unpack it first, then open the model inside.')
  }
  return {entryCount, directorySize, directoryOffset}
}


/**
 * An entry's sizes and offset, from its zip64 extra field where the 32-bit
 * directory fields are saturated. The extra field holds only the saturated
 * ones, in this fixed order.
 *
 * @param {DataView} dir the central directory
 * @param {number} at where this entry's record starts
 * @param {number} extraStart where its extra field starts
 * @param {number} extraLength
 * @return {{size: number, compressedSize: number, localHeaderOffset: number}}
 */
function resolveZip64Sizes(dir, at, extraStart, extraLength) {
  const sizes = {
    size: dir.getUint32(at + CDH_SIZE, true),
    compressedSize: dir.getUint32(at + CDH_COMPRESSED_SIZE, true),
    localHeaderOffset: dir.getUint32(at + CDH_LOCAL_HEADER_OFFSET, true),
  }
  const saturated = ['size', 'compressedSize', 'localHeaderOffset'].filter((key) => sizes[key] === U32_MAX)
  if (saturated.length === 0) {
    return sizes
  }
  const extraEnd = extraStart + extraLength
  for (let field = extraStart; field + EXTRA_HEADER_BYTES <= extraEnd;) {
    const id = dir.getUint16(field, true)
    const length = dir.getUint16(field + U16_BYTES, true)
    // Bounded by the extra field the record declares, not by the length this
    // sub-field claims: a claimed 0xFFFF in a 4-byte field would otherwise
    // read past the record, and off the end of the directory.
    const fieldEnd = field + EXTRA_HEADER_BYTES + length
    if (fieldEnd > extraEnd) {
      throw new ZipArchiveError(DAMAGED_MESSAGE)
    }
    if (id === ZIP64_EXTRA_ID) {
      let value = field + EXTRA_HEADER_BYTES
      for (const key of saturated) {
        if (value + U64_BYTES > fieldEnd) {
          throw new ZipArchiveError(DAMAGED_MESSAGE)
        }
        sizes[key] = readU64(dir, value)
        value += U64_BYTES
      }
      return sizes
    }
    field = fieldEnd
  }
  throw new ZipArchiveError(DAMAGED_MESSAGE)
}


/**
 * A little-endian uint64 as a Number. Past 2^53 it is no longer exact, which
 * no archive a browser can hold reaches; every use is then compared with the
 * Blob's size or the ceiling, and refused.
 *
 * @param {DataView} view
 * @param {number} at
 * @return {number}
 */
function readU64(view, at) {
  return Number(view.getBigUint64(at, true))
}


/**
 * @param {string} path an entry's full path
 * @return {boolean} whether it is Finder's metadata rather than a file the
 *   user zipped
 */
function isMacMetadata(path) {
  return path.startsWith('__MACOSX/') || path.slice(path.lastIndexOf('/') + 1).startsWith('._')
}
