import axios from 'axios'
// three's vendored fflate — already shipped for its EXR/other loaders,
// so this adds no bundle weight beyond what the app carries.
import {Gunzip} from 'three/examples/jsm/libs/fflate.module.js'
import {assertDefined} from './utils/assert'
import debug from './utils/debug'


export const supportedTypes = [
  // '3dm',
  // 'bld',
  'fbx',
  'glb',
  'gltf',
  'ifc',
  // Gaussian splat formats (loaded via Spark — see src/loader/splats.js).
  // Listed with the rest so routes, drag-drop and permalinks all pick
  // them up.
  'ksplat',
  'obj',
  'pdb',
  'ply',
  'sog',
  'splat',
  'spz',
  'step',
  'stl',
  'stp',
  'usd',
  'usda',
  'usdc',
  'usdz',
  'xyz',
]

export const supportedTypesUsageStr = `${supportedTypes.join(',')}`


/**
 * Make a non-capturing group of a choice of filetypes. Alternation is
 * first-match, so sort longest-first: with 'usd' ahead of 'usda', a bare
 * `exec('usda')` would match just the 'usd' prefix and misreport the
 * extension.
 */
export const typeRegexStr = `(?:${[...supportedTypes].sort((a, b) => b.length - a.length).join('|')})`


/** */
export const filetypeRegex = new RegExp(typeRegexStr, 'i')


/** Prepend it with a '.' to make a file suffix*/
const fileSuffixRegex = new RegExp(`\\.${typeRegexStr}`, 'i')


/**
 * The model file's ".<type>" suffix at a path-segment boundary (followed by
 * '/' or end-of-string). Use this — not the bare `filetypeRegex` — to split a
 * URL pathname into (model file, element path): the bare regex also matches
 * type names appearing as plain directory segments (e.g. the "step" in
 * ".../test-models/main/step/nist/as1.stp/1/2"), which splits the pathname
 * into three parts and silently defeats the element-path parse. The lookahead
 * keeps the match zero-width on the boundary so `String.split` drops only the
 * suffix itself.
 */
export const fileSuffixBoundaryRegex = new RegExp(`\\.${typeRegexStr}(?=/|$)`, 'i')


/**
 * @param {string} ext
 * @return {boolean} Is supported
 */
export function isExtensionSupported(ext) {
  return ext.match(filetypeRegex) !== null
}


/**
 * Check if the path suffix is supported, e.g. "model.glb" or "path/to/model.GLB".
 *
 * @param {string} pathWithSuffix
 * @return {boolean} Is supported
 */
export function pathSuffixSupported(pathWithSuffix) {
  const lastDotNdx = pathWithSuffix.lastIndexOf('.')
  if (lastDotNdx === -1) {
    return false
  }
  return isExtensionSupported(pathWithSuffix.substring(lastDotNdx + 1))
}


/**
 * Given a path or extension, return just the extension, and only if it is
 * recognized.  Otherwise throw a FilenameParseError.
 *
 * @param {string} pathOrExt
 * @return {string} The extension
 * @throws FilenameParseError If extension is not supported
 */
export function getValidExtension(pathOrExt) {
  assertDefined(pathOrExt)
  const lastDotNdx = pathOrExt.lastIndexOf('.')
  if (lastDotNdx !== -1) {
    pathOrExt = pathOrExt.substring(lastDotNdx + 1)
  }
  pathOrExt = pathOrExt.toLowerCase()
  const match = filetypeRegex.exec(pathOrExt)
  if (!match) {
    throw new FilenameParseError(`pathOrExt(${pathOrExt}) must contain ".${typeRegexStr}" (case-insensitive)`)
  }
  return match[0]
}


// File header magic is clear by this offset
const HEADER_LIMIT = 1024

// GLB binary format magic ("glTF" in ASCII)
const GLB_MAGIC = Array.from('glTF', (c) => c.charCodeAt(0))

// USDC (crate) files start with the ASCII bytes "PXR-USDC"
const USDC_MAGIC = Array.from('PXR-USDC', (c) => c.charCodeAt(0))

// Zip local-file-header signature "PK\x03\x04". A zip signature alone
// is NOT enough to classify as usdz — docx/xlsx/plain .zip uploads are
// zips too, and they must keep failing sniffing cleanly ("unknown
// type" alert) instead of dying downstream in USDLoader. See
// looksLikeUsdzArchive for the disambiguation.
const ZIP_MAGIC = [...Array.from('PK', (c) => c.charCodeAt(0)), 3, 4]

// Zip local file header layout: filename length is a LE uint16 at
// offset 26; the filename itself starts at offset 30.
const ZIP_NAME_LEN_OFFSET = 26
const ZIP_NAME_OFFSET = 30

// gzip magic (0x1f 0x8b) read as a little-endian uint16. Among the
// supported formats only .spz (gzipped gaussian-splat data) is a gzip
// stream, so the magic is a sufficient discriminator here.
const GZIP_MAGIC_NUMBER = 0x8B1F


/**
 * @param {string} path
 * @return {Promise<string|null>} The result of the `analyzeHeader` function on the downloaded file.
 */
export async function guessType(path) {
  debug().log('Filetype#guessType, path:', path)
  const response = await axios.get(path, {
    headers: {
      Range: `bytes=0-${HEADER_LIMIT}`,
    },
    responseType: 'arraybuffer',
  })
  const headerBuffer = response.data
  return analyzeHeader(headerBuffer)
}


/**
 * Analyzes the file type from a File object.
 *
 * @param {File} file The File object to analyze.
 * @return {Promise<string|null>} A promise that resolves to the file type or null if not recognized.
 */
export async function guessTypeFromFile(file) {
  debug().log('Filetype#guessTypeFromFile, file:', file)
  const start = 0
  const headerLimit = 1024
  const end = Math.min(file.size, headerLimit)
  const fileSlice = file.slice(start, end)
  const headerBuffer = await fileSlice.arrayBuffer()
  return analyzeHeader(headerBuffer)
}


/**
 * Attempts to guess the filetype by inspecting the given headerBuffer
 *
 * @param {ArrayBuffer} headerBuffer
 * @return {string|null} type
 */
export function analyzeHeader(headerBuffer) {
  // Check binary formats first (binary files won't decode properly as UTF-8)
  if (matchesMagic(headerBuffer, GLB_MAGIC)) {
    return 'glb'
  }
  if (matchesMagic(headerBuffer, USDC_MAGIC)) {
    return 'usdc'
  }
  if (headerBuffer.byteLength >= 2 &&
      new DataView(headerBuffer).getUint16(0, true) === GZIP_MAGIC_NUMBER) {
    // The gzip signature is shared by SPZ splats and every ordinary
    // gzipped upload (.tar.gz, gzipped logs/JSON) — same trap as the
    // zip branch below. Decompress the head and require SPZ's own
    // magic; anything else stays unrecognized so it fails sniffing
    // cleanly instead of dying inside the splat decoder.
    return looksLikeSpzStream(headerBuffer) ? 'spz' : null
  }
  if (matchesMagic(headerBuffer, ZIP_MAGIC)) {
    // The zip signature is shared by USDZ packages, SOG splat bundles,
    // and plain office/zip uploads — peek the first entry's name to
    // tell them apart; anything else stays unrecognized so it fails
    // sniffing cleanly instead of dying downstream in a loader.
    if (looksLikeUsdzArchive(headerBuffer)) {
      return 'usdz'
    }
    if (looksLikeSogArchive(headerBuffer)) {
      return 'sog'
    }
    return null
  }

  const decoder = new TextDecoder('utf-8')
  const headerStr = decoder.decode(headerBuffer)
  return analyzeHeaderStr(headerStr)
}


/**
 * True when the buffer begins with the given magic byte sequence.
 *
 * @param {ArrayBuffer} headerBuffer
 * @param {Array<number>} magicBytes
 * @return {boolean}
 */
function matchesMagic(headerBuffer, magicBytes) {
  if (headerBuffer.byteLength < magicBytes.length) {
    return false
  }
  const bytes = new Uint8Array(headerBuffer, 0, magicBytes.length)
  return magicBytes.every((b, i) => bytes[i] === b)
}


/**
 * Distinguish a USDZ package from any other zip container (docx, xlsx,
 * plain .zip) by peeking at the first entry's filename in the local
 * file header. The USDZ spec requires the package's first entry to be
 * the root USD layer, and three's USDLoader errors out otherwise — so
 * gating on it here both rejects non-USD zips cleanly at sniff time
 * and never rejects a USDZ the loader could actually open.
 *
 * @param {ArrayBuffer} headerBuffer at least the first zip local file
 *   header (the sniff window is 1KB; the header + name fit comfortably)
 * @return {boolean}
 */
function looksLikeUsdzArchive(headerBuffer) {
  return /\.usd[ac]?$/i.test(firstZipEntryName(headerBuffer))
}


// SPZ header magic 0x5053474e, little-endian on disk: 'NGSP' as the
// first four DECOMPRESSED bytes of every .spz file (Niantic spz spec).
const SPZ_MAGIC = Array.from('NGSP', (c) => c.charCodeAt(0))


/**
 * Distinguish an SPZ splat from any other gzip stream by inflating the
 * head and checking SPZ's own magic. The header buffer is a truncated
 * prefix of the file, so this streams through fflate's `Gunzip` (which
 * emits the decompressed prefix of a partial member) rather than
 * `gunzipSync` (which would throw on the missing tail).
 *
 * @param {ArrayBuffer} headerBuffer
 * @return {boolean}
 */
function looksLikeSpzStream(headerBuffer) {
  try {
    /** @type {Array<Uint8Array>} */
    const chunks = []
    const gunzip = new Gunzip()
    gunzip.ondata = (chunk) => {
      chunks.push(chunk)
    }
    gunzip.push(new Uint8Array(headerBuffer), false)
    const decoded = chunks[0]
    return decoded !== undefined && decoded.length >= SPZ_MAGIC.length &&
      SPZ_MAGIC.every((byte, index) => decoded[index] === byte)
  } catch {
    // Truncated-at-an-awkward-boundary or corrupt gzip: not sniffable.
    return false
  }
}


/**
 * Distinguish a PlayCanvas SOG splat bundle from other zip containers by
 * the same first-entry peek: SOG bundles carry a `meta.json` manifest
 * (splat-transform writes it as the leading entry) alongside the webp
 * planes. First-entry order isn't formally guaranteed, so a bundle that
 * leads with a webp fails sniffing — extension-carrying `.sog` paths
 * never reach this and still load.
 *
 * @param {ArrayBuffer} headerBuffer
 * @return {boolean}
 */
function looksLikeSogArchive(headerBuffer) {
  return /(^|\/)meta\.json$/i.test(firstZipEntryName(headerBuffer))
}


/**
 * The first zip entry's filename from a buffer holding at least the first
 * local file header (the 1KB sniff window fits header + name comfortably).
 * Empty string when the buffer is too short.
 *
 * @param {ArrayBuffer} headerBuffer
 * @return {string}
 */
function firstZipEntryName(headerBuffer) {
  if (headerBuffer.byteLength < ZIP_NAME_OFFSET) {
    return ''
  }
  const view = new DataView(headerBuffer)
  const nameLen = view.getUint16(ZIP_NAME_LEN_OFFSET, true)
  const nameEnd = Math.min(ZIP_NAME_OFFSET + nameLen, headerBuffer.byteLength)
  const nameBytes = new Uint8Array(headerBuffer, ZIP_NAME_OFFSET, nameEnd - ZIP_NAME_OFFSET)
  return new TextDecoder('utf-8').decode(nameBytes)
}


/**
 * Attempts to guess the filetype by inspecting the given header string
 *
 * @param {string} header
 * @return {string|null} type
 */
export function analyzeHeaderStr(header) {
  debug().log('Filetype#analyzeHeader, header:', header)
  if (header.includes('"metadata"')) {
    return 'bld'
  } else if (header.startsWith('ply')) {
    // PLY magic. Both mesh/point-cloud PLY and gaussian-splat PLY start
    // this way; both route to the splat loader (spark renders plain
    // point clouds as degenerate splats).
    return 'ply'
  } else if (header.startsWith('#usda')) {
    return 'usda'
  } else if (header.includes('FBX')) {
    return 'fbx'
  } else if (header.startsWith('glTF')) {
    return 'gltf'
  } else if (header.match(/(^\s*#.*$)?(^\s*$)*^\s*v(\s+-?\d+(\.\d+)?){3}\s*$/m)) {
    return 'obj'
  } else if (header.includes('ISO-10303-21')) {
    // IFC and STEP share the ISO-10303-21 (STEP physical file) envelope and,
    // in this app, the same Conway loader. They differ only in their
    // FILE_SCHEMA: IFC declares an IFC schema (IFC2X3 / IFC4 / IFC4X3 / ...),
    // generic STEP declares an application protocol (AUTOMOTIVE_DESIGN,
    // CONFIG_CONTROL_DESIGN, AP203/AP214/AP242, ...). Disambiguate so the
    // upload/temp URL extension reflects the real format instead of always
    // labeling part-21 files ".ifc".
    return classifyStepFamily(header)
  } else if (header.match(/\s*(HEADER|COMPND|ORIGX1)/)) { // matches IFC & STEP, so put after
    return 'pdb'
  } else if (header.startsWith('solid') || header.includes('VCG')) {
    // TODO(pablo): binary STL is an arbitrary 80 byte header, followed by an
    // int for number of triangles, and then triangle data, 50 bytes per
    return 'stl'
  } else if (header.match(/(^\s*(#.*|\s*)$)*(\s*-?\d+(\.\d+)?){3}\s*$/m)) {
    return 'xyz'
  } else {
    return null
  }
}


/**
 * Classify an ISO-10303-21 (STEP physical file) header as IFC or generic
 * STEP. We anchor on the FILE_SCHEMA entry's value rather than searching the
 * whole header for "IFC", so an "IFC" substring elsewhere (e.g. a project
 * name in FILE_NAME) doesn't cause a false IFC classification.
 *
 * IFC schema names always begin with "IFC" (IFC2X3, IFC4, IFC4X3, ...); any
 * other schema is treated as generic STEP. If FILE_SCHEMA isn't present in
 * the sniffed header window (e.g. an unusually long FILE_DESCRIPTION pushed
 * it past the 1024-byte limit), default to 'ifc' — that preserves the prior
 * behavior for the dominant format, and both types load through the same
 * loader regardless.
 *
 * @param {string} header
 * @return {string} 'ifc' or 'step'
 */
export function classifyStepFamily(header) {
  return stepFamily(header) ?? 'ifc'
}


/**
 * The schema family an ISO-10303-21 header declares — `'ifc'` or `'step'` —
 * or null when it declares nothing this can read (no HEADER section, no
 * FILE_SCHEMA entity, or one carrying no schema name at all: an empty
 * `FILE_SCHEMA(( ))` / `FILE_SCHEMA(( '' ))`, malformed but seen in the wild).
 *
 * Three-valued on purpose, so a caller can tell "this file says STEP" apart
 * from "this file did not say". {@link classifyStepFamily} folds those
 * together into `'ifc'`: the right default when the answer only picks a
 * filename, and the wrong one for a caller whose false-`'ifc'` costs more
 * than a false `'step'`. `Loader.js#canOpenFromStore` is the second kind — it
 * gates conway's IFC-only store open, where guessing `'ifc'` burns a model
 * handle and caches a GLB with no NavTree (bldrs-ai/Share#1776) — so it asks
 * this function directly and treats null as "buffer".
 *
 * Mirrors conway's `ModelFormatDetector.detect`
 * (`format_detection/model_format_detector.js`), because a disagreement in
 * the "we say IFC, conway does not" direction is exactly #1776 again. Two
 * details of that loop are load-bearing and neither is obvious:
 *
 *   - It returns on the FIRST entry matching ANY known schema, testing IFC,
 *     AUTOMOTIVE_DESIGN, CONFIG_CONTROL_DESIGN/AP203 and AP242 within each
 *     entry before moving to the next. So `(('AUTOMOTIVE_DESIGN'),('IFC4'))`
 *     is AP214 to conway, which never sees the IFC4. Asking instead whether
 *     ANY entry starts with IFC answers 'ifc' there — the dangerous
 *     direction, and what codex caught on this PR.
 *   - Entries are compared with spaces stripped, so `' I FC4'` is IFC4.
 *
 * An entry conway recognises nothing in is skipped, and a header whose every
 * entry is unrecognised yields null here just as it yields no format there.
 *
 * One divergence remains, in the safe direction. When an entity declares no
 * quoted entry at all, conway falls back to testing the raw block text; we
 * report null. That fallback can only say IFC for input malformed enough to
 * put a bare `IFC…` token where a quoted list belongs, and null makes us
 * buffer, which costs a load's memory win and never mis-routes a STEP file.
 *
 * @param {string} header a Part-21 header window
 * @return {string|null} 'ifc', 'step', or null when nothing is declared
 */
export function stepFamily(header) {
  for (const entry of fileSchemaEntries(header)) {
    const family = schemaFamily(entry)
    if (family !== null) {
      return family
    }
  }
  return null
}


// The schema-name prefixes conway's `ModelFormatDetector` recognises, in the
// order it tests them, each mapped to the family Share cares about. IFC is the
// only one that reaches conway's IFC-only store open; AP214/AP203/AP242 all
// mean "STEP" here, and anything unrecognised means conway detects no format
// at all.
const SCHEMA_FAMILIES = [
  ['IFC', 'ifc'],
  ['AUTOMOTIVE_DESIGN', 'step'],
  ['CONFIG_CONTROL_DESIGN', 'step'],
  ['AP203', 'step'],
  ['AP242', 'step'],
]


/**
 * The family of one normalised schema name, or null when conway recognises
 * no format in it.
 *
 * @param {string} entry uppercased, space-stripped schema name
 * @return {string|null} 'ifc', 'step', or null
 */
function schemaFamily(entry) {
  for (const [prefix, family] of SCHEMA_FAMILIES) {
    if (entry.startsWith(prefix)) {
      return family
    }
  }
  return null
}


/**
 * Every schema name the effective FILE_SCHEMA entity declares, uppercased
 * and space-stripped — conway's own normalisation
 * (`schema.toLocaleUpperCase()` then `rawEntry.replaceAll(' ', '')`), so
 * `' I FC4 '` reads as `IFC4` here exactly as it does there.
 *
 * "Effective" is the LAST FILE_SCHEMA statement in the header section:
 * conway stores header entities in a Map keyed by name
 * (`step_parser.js:193`), so a header carrying the entity twice overwrites
 * and the later one wins.
 *
 * @param {string} header
 * @return {string[]} normalised schema names, empty when none are declared
 */
function fileSchemaEntries(header) {
  const section = part21HeaderSection(maskPart21Comments(header))
  if (section === null) {
    return []
  }
  const statement = lastFileSchemaStatement(section)
  if (statement === null) {
    return []
  }
  // `/ /g`, not `\s`: conway strips literal spaces only (`replaceAll(' ', '')`),
  // so a tab inside a schema name must survive here exactly as it does there.
  // (`String.replaceAll` itself is past this project's TS lib target.)
  return [...statement.matchAll(/'([^']*)'/g)]
    .map((match) => match[1].toUpperCase().replace(/ /g, ''))
    .filter((entry) => entry.length > 0)
}


/**
 * The last FILE_SCHEMA statement in a header section, or null.
 *
 * Matching at the statement start is what keeps a longer identifier out:
 * `NOT_FILE_SCHEMA(('IFC4'));` is its own statement and does not begin with
 * `FILE_SCHEMA`, so it is invisible here just as it is to conway, which
 * parses records under their exact names.
 *
 * @param {string} section comment-masked header-section text
 * @return {string|null}
 */
function lastFileSchemaStatement(section) {
  let found = null
  for (const statement of part21Statements(section)) {
    if (/^\s*FILE_SCHEMA\s*\(/i.test(statement)) {
      found = statement
    }
  }
  return found
}


/**
 * Split Part-21 text on `;` into statements, ignoring semicolons inside
 * string literals (where `;` is ordinary text, and an apostrophe is escaped
 * by doubling it). Pass comment-masked text — a `;` inside a comment would
 * otherwise split a statement in two.
 *
 * @param {string} text comment-masked Part-21 text
 * @return {string[]} statement texts, without their terminating semicolons
 */
function part21Statements(text) {
  const out = []
  let start = 0
  let at = 0
  let inString = false
  while (at < text.length) {
    const c = text[at]
    if (inString) {
      if (c === `'` && text[at + 1] === `'`) {
        at += 2
        continue
      }
      if (c === `'`) {
        inString = false
      }
      at++
      continue
    }
    if (c === `'`) {
      inString = true
      at++
      continue
    }
    if (c === ';') {
      out.push(text.slice(start, at))
      at++
      start = at
      continue
    }
    at++
  }
  if (start < text.length) {
    out.push(text.slice(start))
  }
  return out
}


/**
 * The HEADER section of a Part-21 file, or null when there is none in the
 * window. Pass comment-masked text.
 *
 * Bounding matters because the caller sniffs a fixed 64 KiB prefix, which on
 * any real model runs well into DATA — where a quoted string is free to
 * contain something that looks like a header entity. conway reads FILE_SCHEMA
 * from the parsed HEADER section only, so scanning past ENDSEC could have us
 * answer IFC from a property value while conway answers AP214 from the real
 * header. Truncating early (an `ENDSEC;` inside a header string literal, say)
 * costs at worst a missed schema, which reads as "did not say" and buffers.
 *
 * @param {string} masked comment-masked Part-21 text
 * @return {string|null} the header section's text
 */
function part21HeaderSection(masked) {
  const start = masked.search(/\bHEADER\s*;/i)
  if (start === -1) {
    return null
  }
  const rest = masked.slice(start)
  const end = rest.search(/\bENDSEC\s*;/i)
  return end === -1 ? rest : rest.slice(0, end)
}


/**
 * Blank out ISO-10303-21 `/* ... *``/` comments, leaving string literals
 * intact, so a text scan sees what conway's parser sees.
 *
 * Two failures motivate this, and only masking fixes both. Part-21 permits a
 * comment anywhere whitespace is allowed and conway's `StepHeaderParser`
 * consumes one AS whitespace (its `whitespace()` loops on the comment
 * parser), so:
 *
 *   - `FILE_SCHEMA /* note *``/ (('IFC4'))` is IFC to conway. A plain `\s*`
 *     scan misses it and reports no schema — costing a large IFC its
 *     windowed parse.
 *   - `/* FILE_SCHEMA(('IFC4')); *``/ FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));` is
 *     AP214 to conway. A raw-text scan finds the commented-out entity first
 *     and reports IFC — the dangerous direction, which sends a STEP file
 *     down conway's IFC-only store open and burns a model handle
 *     (bldrs-ai/Share#1776).
 *
 * The second is why this masks rather than making the gap pattern
 * comment-aware: a token can be *inside* a comment, not merely separated by
 * one, and no amount of tolerance between tokens excludes it.
 *
 * String-literal aware, because inside a Part-21 string `/*` is ordinary
 * text. An apostrophe is escaped by doubling it (`''`), which keeps the
 * string open. An unterminated comment swallows the rest of the window,
 * which matches conway's own reading and fails safe: no schema found.
 *
 * @param {string} text a Part-21 header window
 * @return {string} the same text with comment spans replaced by a space
 */
function maskPart21Comments(text) {
  let out = ''
  let at = 0
  let inString = false
  while (at < text.length) {
    const c = text[at]
    if (inString) {
      if (c === `'` && text[at + 1] === `'`) {
        out += `''`
        at += 2
        continue
      }
      if (c === `'`) {
        inString = false
      }
      out += c
      at++
      continue
    }
    if (c === `'`) {
      inString = true
      out += c
      at++
      continue
    }
    if (c === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2)
      if (end === -1) {
        return out
      }
      out += ' '
      at = end + 2
      continue
    }
    out += c
    at++
  }
  return out
}


/**
 * TODO(pablo): deprecated.  The behavior wasn't defined enough to be used
 * consistently between src/Share and src/Filetype.
 *
 * example:
 * - 'asdf.ifc/1234' -> {parts: ['asdf', '1234'], extension: '.ifc'}
 * - 'asdf.ifc' -> {parts: ['asdf'], extension: '.ifc'}
 * - 'asdf' -> throws FilenameParseError
 *
 * @deprecated
 * @param {string} filepath
 * @return {{parts: Array.<string>, extension: string}}
 */
export function splitAroundExtension(filepath) {
  assertDefined(filepath)
  const match = fileSuffixRegex.exec(filepath)
  if (!match) {
    throw new FilenameParseError(`Filepath(${filepath}) must contain ".${typeRegexStr}" (case-insensitive)`)
  }
  const parts = filepath.split(fileSuffixRegex)
  return {parts, extension: match[0]}
}


/**
 * Split around extension and remove the first slash.
 *
 * @param {string} filepath
 * @return {{parts: Array.<string>, extension: string}}
 */
export function splitAroundExtensionRemoveFirstSlash(filepath) {
  const {parts, extension} = splitAroundExtension(filepath)
  if (parts[1].startsWith('/')) {
    parts[1] = parts[1].slice(1)
  }
  return {parts, extension}
}


/** Custom error for better catch in UI. */
export class FilenameParseError extends Error {
  /** @param {string} msg */
  constructor(msg) {
    super(msg)
    this.name = 'FilenameParseError'
  }
}
