import axios from 'axios'
import {assertDefined} from './utils/assert'
import debug from './utils/debug'


export const supportedTypes = [
  // '3dm',
  // 'bld',
  'fbx',
  'glb',
  'gltf',
  'ifc',
  'obj',
  'pdb',
  'step',
  'stl',
  'stp',
  'xyz',
]

export const supportedTypesUsageStr = `${supportedTypes.join(',')}`


/** Make a non-capturing group of a choice of filetypes. */
export const typeRegexStr = `(?:${supportedTypes.join('|')})`


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

// GLB binary format magic number ("glTF" in little-endian)
const GLB_MAGIC_NUMBER = 0x46546C67


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
  // Check for GLB binary format first (binary files won't decode properly as UTF-8)
  const view = new DataView(headerBuffer)
  if (headerBuffer.byteLength >= 4) {
    // GLB files start with magic number ("glTF" in ASCII)
    const magic = view.getUint32(0, true) // little-endian
    if (magic === GLB_MAGIC_NUMBER) {
      return 'glb'
    }
  }

  const decoder = new TextDecoder('utf-8')
  const headerStr = decoder.decode(headerBuffer)
  return analyzeHeaderStr(headerStr)
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
  const schemaMatch = header.match(/FILE_SCHEMA\s*\(\s*\(\s*'\s*([A-Za-z0-9_]+)/i)
  if (schemaMatch === null) {
    return 'ifc'
  }
  return /^IFC/i.test(schemaMatch[1]) ? 'ifc' : 'step'
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
