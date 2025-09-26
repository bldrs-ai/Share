import {splitAroundExtension} from '../Filetype'
import debug from './debug'
import {testUuid} from './strings'


/**
 * Converts a filepath requested path to a model spec object.  For use by IfcViewerAPIExtended.load.
 *
 * Format is either a reference within this project's serving directory:
 *   {filepath: '/file.ifc'}
 *
 * or an uploaded path:
 *   {filepath: '/xxxx-xxxx-xxxx-xxxx'}
 *
 * or a global GitHub path:
 *   {gitpath: 'http://host/share/v/gh/bldrs-ai/Share/main/index.ifc'}
 *
 * or a Google file ID:
 *   {google: '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO'}
 *
 * or a URL:
 *   {url: 'http://host.com/file.ifc'}
 *
 * @param {string} installPrefix e.g. /share
 * @param {string} pathPrefix e.g. /share/v/p
 * @param {object} routeParams e.g.:
 *     .../:org/:repo/:branch/ with .../a/b/c/d
 *   becomes:
 *     {
 *       '*': 'a/b/c/d',
 *       'org': 'a',
 *       ...
 *     }
 * @return {object|null} Null will result in a redirect to the index file.
 * Exported for testing only.
 */
export function handleRoute(pathPrefix, routeParams) {
  let m = null
  let filepath = routeParams['*']
  if (filepath === '') {
    return null
  }

  if (pathPrefix.endsWith('/u')) {
    const urlOrGoogleId = processExternalUrl(filepath)
    if (urlOrGoogleId) {
      if (urlOrGoogleId !== filepath) {
        return {google: urlOrGoogleId}
      }
      // Otherwise it's a url
      return {url: urlOrGoogleId}
    }
    return null
  }

  // everything else still expects a "file path + optional eltPath"
  let parts
  let extension
  try {
    ({parts, extension} = splitAroundExtension(filepath))
  } catch (e) {
    if (testUuid(filepath)) {
      return {filepath, extension: null}
    }
    alert(`Unsupported filetype: ${filepath}`)
    debug().error(e)
    return null
  }

  filepath = `/${parts[0]}${extension}`

  if (pathPrefix.endsWith('new') || pathPrefix.endsWith('/p')) {
    // project file case
    m = processProjectFile(filepath, parts[1])
    debug().log('Share#handleRoute: is a project file:', m, window.location.hash)
  } else if (pathPrefix.endsWith('/gh')) {
    // GitHub case
    m = processGitHubFile(filepath, parts[1], routeParams)
    debug().log('Share#handleRoute: is a remote GitHub file:', m)
  } else {
    throw new Error('Empty view type from pathPrefix')
  }

  return m
}


/**
 * Validates if a string is a valid URL by attempting to create a URL object.
 *
 * @param {string} urlString - The string to validate as a URL
 * @return {boolean} - True if the string is a valid URL, false otherwise
 */
export function isValidUrl(urlString) {
  try {
    new URL(urlString)
    return true
  } catch (e) {
    return false
  }
}


/**
 * Processes a URL filepath for external content, currently supporting Google Drive.
 *
 * @param {string} filepath - The URL to process
 * @return {object|null} - The original URL, a Google File ID or null.
 */
export function processExternalUrl(filepath) {
  if (!isValidUrl(filepath)) {
    return null
  }

  // For now, only support public Google Drive files, so just need their ID
  const googleFileId = processGoogleDriveUrl(filepath)
  if (googleFileId) {
    return googleFileId
  }

  // If not Google Drive, return the original URL
  return filepath
}


/**
 * Processes a project file path for local files (/new and /p pathPrefixes).
 *
 * @param {string} filepath - The file path to process
 * @param {string} eltPath - Optional element path
 * @return {object} - Object with filepath and eltPath
 */
export function processProjectFile(filepath, eltPath) {
  return {
    filepath,
    eltPath,
  }
}


/**
 * Processes a GitHub file path for remote repository files.
 *
 * @param {string} filepath - The file path within the repository
 * @param {string} eltPath - Optional element path
 * @param {object} routeParams - URL parameters containing org, repo, branch
 * @return {object} - Object with org, repo, branch, filepath, eltPath, and gitpath
 */
export function processGitHubFile(filepath, eltPath, routeParams) {
  const result = {
    org: routeParams['org'],
    repo: routeParams['repo'],
    branch: routeParams['branch'],
    filepath,
    eltPath,
  }
  result.getRepoPath = () => `/${result.org}/${result.repo}/${result.branch}${result.filepath}`
  result.gitpath = `https://github.com${result.getRepoPath()}`
  return result
}


// Google
const GOOGLE_API_KEY = 'AIzaSyDBunWqj2zJAqXxJ6wV9BfSd-8DvJaKNpQ'

/**
 * Processes a Google Drive URL and returns the processed URL for
 * googleapis.com, with our API_KEY.
 *
 * @param {string} filepath - The Google Drive URL to process
 * @return {string|null} - The processed URL or null if not a Google Drive URL
 */
export function processGoogleDriveUrl(filepath) {
  const driveRegexes = [
    new RegExp('https://drive.google.com/file/d/(?<id>[^/]+)/view'),
    new RegExp('https://www.googleapis.com/drive/v3/files/(?<id>[^/])'),
  ]

  for (const re of driveRegexes) {
    const m = filepath.match(re)
    const id = m?.groups?.id
    if (id) {
      return id
    }
  }

  return null
}
