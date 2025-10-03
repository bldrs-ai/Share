import {splitAroundExtension} from '../Filetype'
import debug from '../utils/debug'
import {testUuid} from '../utils/strings'
import processGitHubFile, {GitHubFileResult, GitHubRouteParams} from './github'
import {GoogleFileResult, processGoogleDriveUrl} from './google'


/**
 * Converts a filepath requested path to a model spec object.
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
 * @param pathPrefix e.g. /share
 * @param routeParams e.g.:
 *     .../:org/:repo/:branch/ with .../a/b/c/d
 *   becomes:
 *     {
 *       '*': 'a/b/c/d',
 *       'org': 'a',
 *       ...
 *     }
 * @return Null will result in a redirect to the index file.
 * Exported for testing only.
 */
export function handleRoute(pathPrefix: string, routeParams: RouteParams): RouteResult | null {
  let m: RouteResult = null
  let filepath: string = routeParams['*']
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
  let parts: string[]
  let extension: string
  try {
    ({parts, extension} = splitAroundExtension(filepath))
  } catch (e) {
    if (testUuid(filepath)) {
      return {filepath, eltPath: null}
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
    m = processGitHubFile(filepath, parts[1], routeParams as GitHubRouteParams)
    debug().log('Share#handleRoute: is a remote GitHub file:', m)
  } else {
    throw new Error('Empty view type from pathPrefix')
  }

  return m
}


/**
 * Processes a URL filepath for external content, currently supporting Google Drive.
 *
 * @param filepath - The URL to process
 * @return The original URL, a Google File ID or null.
 */
export function processExternalUrl(filepath: string): string | null {
  try {
    new URL(filepath)
  } catch {
    return null
  }
  // For now, only support public Google Drive files, so just need their ID
  const googleResult = processGoogleDriveUrl(filepath)
  if (googleResult) {
    return googleResult.fileId
  }
  // If not Google Drive, return the original URL
  return filepath
}


/**
 * Processes a project file path for local files (/new and /p pathPrefixes).
 *
 * @param filepath - The file path to process
 * @param eltPath - Optional element path
 * @return Object with filepath and eltPath
 */
export function processProjectFile(filepath: string, eltPath: string | undefined): FileResult {
  return {
    sourceUrl: new URL(filepath),
    kind: 'file',
    filepath,
    ...(eltPath ? {eltPath} : {}),
  }
}

// Types
// Everything from useParams is string | undefined.
// Include the splat as '*' (may be undefined if route has no splat).
export type BaseParams = Record<string, string | undefined> & {
  '*': string | undefined
}

export interface BaseResult {
  sourceUrl: URL
}

export interface FileResult extends BaseResult {
  kind: 'file'
  filepath: string
  eltPath?: string
}

export interface UrlResult extends BaseResult {
  kind: 'url'
}

export interface ProviderResult extends BaseResult {
  kind: 'provider'
}
