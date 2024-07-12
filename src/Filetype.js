import axios from 'axios'
import {assertDefined} from './utils/assert.js'


// TODO: 3dm, glb
export const supportedTypes = ['bld', 'fbx', 'glb', 'ifc', 'obj', 'pdb']

export const supportedTypesUsageStr = `${supportedTypes.join(',')}`


/** Make a non-capturing group of a choice of filetypes. */
export const typeRegexStr = `(?:${supportedTypes.join('|')})`


/** */
export const filetypeRegex = new RegExp(typeRegexStr, 'i')


/** Prepend it with a '.' to make a file suffix*/
const fileSuffixRegex = new RegExp(`\\.${typeRegexStr}`, 'i')


/**
 * @param {string} ext
 * @return {boolean} Is supported
 */
export function isExtensionSupported(ext) {
  return ext.match(filetypeRegex) !== null
}


/**
 * @param {string} strWithSuffix
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
  const match = filetypeRegex.exec(pathOrExt)
  if (!match) {
    throw new FilenameParseError(`pathOrExt(${pathOrExt}) must contain ".${typeRegexStr}" (case-insensitive)`)
  }
  return match[0]
}


export async function guessType(path) {
  console.log('guessType for path: ', path)

  const response = await axios.get(path, {
    headers: {
      Range: 'bytes=0-1023', // Requesting the first 1024 bytes
    },
    responseType: 'arraybuffer',
  })

  // Extracting the Content-Type header
  const contentType = response.headers['content-type']

  const initialContent = response.data
  console.log(`Initial Content Bytes:`, new Uint8Array(initialContent))

  console.log('guessType result..', response, contentType)
  return null
}


/**
 * TODO(pablo): deprecated.  The behavior wasn't defined enough to be used
 * consistently between src/Share and src/Filetype.
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


/** Custom error for better catch in UI. */
export class FilenameParseError extends Error {
  /** @param {string} msg */
  constructor(msg) {
    super(msg)
    this.name = 'FilenameParseError'
  }
}
