import {splitAroundExtensionRemoveFirstSlash} from '../Filetype'
import debug from '../utils/debug'
import {testUuid} from '../utils/strings'
import processGithubParams, {isGithubParams, GithubParams, GithubResult} from './github'
import processGoogleUrl, {GoogleResult, processGoogleFileId} from './google'


/**
 * Converts routes to route results with extracted attributes.
 *
 * e.g.:
 *   /share/v/gh/:org/:repo/:branch/path/to/file.ext/1/2/3
 *
 * becomes:
 *   {
 *     '*': 'path/to/file.ext/1/2/3',
 *     'org': 'o',
 *     'repo': 'r',
 *     'branch': 'b',
 *     'path': 'path/to/file.ext',
 *     'eltPath': '1/2/3',
 *     ...
 *   }
 *
 * @param pathPrefix e.g. /share/v/p or /share/v/new or /share/v/gh or /share/v/u
 * @param routeParams e.g. from ReactRouter useParams
 * @return RouteResult or null
 */
export function handleRoute(pathPrefix: string, routeParams: RouteParams): RouteResult | null {
  debug().log('Share#handleRoute: is a remote GitHub file:', pathPrefix, routeParams)

  const originalUrl = new URL(pathPrefix, window.location.origin)
  let result: RouteResult = null
  // See ShareRoutes.jsx for filepath, here for quick reference, it's the '*' in each route:
  // - Hosted project file: /share/v/p/*
  // - New file via DnD or Open: /share/v/new/*
  // - GitHub file: /share/v/gh/:org/:repo/:branch/*
  // - Generic URL: /share/v/u/*
  const filepath: string = routeParams['*'] || ''
  if (filepath === '') {
    return null
  }

  // Hosted project file or new file via DnD or Open
  if (pathPrefix.endsWith('/p')) {
    result = processFile(originalUrl, filepath)
  }

  // New file via DnD or Open
  if (pathPrefix.endsWith('new')) {
    testUuid(filepath)
    result = processFile(originalUrl, filepath)
  }

  // GitHub file
  if (pathPrefix.endsWith('/gh')) {
    if (isGithubParams(routeParams)) {
      result = processGithubParams(originalUrl, filepath, routeParams as GithubParams) as GithubResult
      debug().log('Share#handleRoute: is a remote GitHub file:', result)
    }
  }

  // Generic URL
  if (pathPrefix.endsWith('/u')) {
    return processExternalUrl(originalUrl, filepath)
  }

  // Shortcut to Google Drive file
  if (pathPrefix.endsWith('/g')) {
    if (filepath.startsWith('http')) {
      result = processGoogleUrl(originalUrl, new URL(filepath)) as GoogleResult
      debug().log('Share#handleRoute: is a remote Google Drive file url:', result)
    } else {
      result = processGoogleFileId(originalUrl, filepath) as GoogleResult
      debug().log('Share#handleRoute: is a remote Google Drive file id:', result)
    }
  }

  return result
}


/**
 * Processes a local file path (/new and /p pathPrefixes).
 *
 * @param originalUrl
 * @param filepath - The embedded file path to process
 * @return Object with original URL, download URL, filepath and eltPath
 */
export function processFile(originalUrl: URL, filepath: string): FileResult {
  debug().log('routes#processFile: is a local file:', filepath)
  const {parts, extension} = splitAroundExtensionRemoveFirstSlash(filepath)
  filepath = `${parts[0]}${extension}`
  const downloadUrl = new URL(filepath, originalUrl.origin)
  return {
    originalUrl,
    downloadUrl,
    kind: 'file',
    filepath,
    ...(parts[1] ? {eltPath: `${parts[1]}`} : {}),
  }
}


/**
 * Processes a URL filepath for external content, currently supporting Google Drive.
 *
 * @param originalUrl
 * @param maybeUrlParam - The embedded file path to process, should be a URL
 * @return The original URL, a Google File ID or null.
 */
export function processExternalUrl(originalUrl: URL, maybeUrlParamStr: string): GoogleResult | UrlResult | null {
  let urlParam: URL
  try {
    urlParam = new URL(maybeUrlParamStr)
  } catch {
    return null
  }
  const result: GoogleResult = processGoogleUrl(originalUrl, urlParam) as GoogleResult
  if (result) {
    return result
  }
  return {
    originalUrl,
    downloadUrl: urlParam,
    kind: 'url',
  } as UrlResult
}


// Types
// Everything from useParams is string | undefined.
// Include the splat as '*' (may be undefined if route has no splat).
export type BaseParams = Record<string, string | undefined> & {
  '*': string | undefined
}

export interface BaseResult {
  originalUrl: URL
  downloadUrl: URL
}

export interface FileResult extends BaseResult {
  kind: 'file'
  filepath: string
  eltPath?: string
}

export interface UrlResult extends BaseResult {
  kind: 'url'
}

// For external providers like GitHub or Google Drive
export interface ProviderResult extends BaseResult {
  kind: 'provider'
}

export type RouteParams = BaseParams & {
  '*': string | undefined
}

export type RouteResult = FileResult | UrlResult | GithubResult | GoogleResult | null
