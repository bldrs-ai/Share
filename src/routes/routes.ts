import {splitAroundExtensionRemoveFirstSlash} from '../Filetype'
import debug from '../utils/debug'
import processGithubParams, {isGithubParams, GithubParams, GithubResult, processGithubUrl} from './github'
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
    // hosted project file
    result = processFile(originalUrl, filepath)
  } else if (pathPrefix.endsWith('/new')) {
    // new file via DnD or Open
    result = processFile(originalUrl, filepath)
  } else if (pathPrefix.endsWith('/gh')) {
    // github file
    if (isGithubParams(routeParams)) {
      result = processGithubParams(originalUrl, filepath, routeParams as GithubParams) as GithubResult
      debug().log('Share#handleRoute: is a remote GitHub file:', result)
    }
  } else if (pathPrefix.endsWith('/u')) {
    // generic url
    return processExternalUrl(originalUrl, filepath)
  } else if (pathPrefix.endsWith('/g')) {
    // shortcut to google drive file id or url
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
 * @param originalUrl - The original URL
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
    isUploadedFile: originalUrl.pathname.startsWith('/share/v/new'),
    filepath,
    ...(parts[1] ? {eltPath: `${parts[1]}`} : {}),
  }
}


/**
 * Processes a URL filepath for external content, supporting GitHub and Google Drive.
 *
 * @param originalUrl - The original URL
 * @param maybeUrlParamStr - The embedded file path to process, should be a URL
 * @return The original URL, a GitHub/Google File ID or null.
 */
export function processExternalUrl(originalUrl: URL, maybeUrlParamStr: string): GithubResult | GoogleResult | UrlResult | null {
  let urlParam: URL
  try {
    urlParam = new URL(maybeUrlParamStr)
  } catch {
    return null
  }

  // Try GitHub URL first
  const githubResult: GithubResult | null = processGithubUrl(originalUrl, urlParam)
  if (githubResult) {
    return githubResult
  }

  // Try Google Drive URL
  const googleResult: GoogleResult | null = processGoogleUrl(originalUrl, urlParam) as GoogleResult
  if (googleResult) {
    return googleResult
  }

  // Fallback to generic URL
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
  mimeType?: string
  title?: string
}

export interface FileResult extends BaseResult {
  kind: 'file'
  isUploadedFile: boolean
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
