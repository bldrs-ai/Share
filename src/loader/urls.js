import {getPathContents} from '../net/github/Files'
import {parseGitHubRepositoryUrl} from '../net/github/utils'
import matcher from './matcher.js'


export const SOURCE_TYPE = {
  URL: 1,
  VCS: 2,
}


/**
 * Process URL to find common redirect targets and parse hash param
 *
 * @param {URL} url
 * @return {object} Share URL object
 */
export function parseUrl(url) {
  if (url === undefined || url === null) {
    throw new Error('No URL provided')
  }

  const parsed = {
    original: url,
    type: undefined,
    target: undefined,
    params: undefined,
  }

  const params = {}
  const paramsList = url.hash.substring(1).split('::')
  paramsList.forEach((p) => {
    const [k, v] = p.split(':')
    params[k] = v
  })
  parsed.params = params

  const baseUrl = url.origin === 'null' ? url : new URL(url.pathname, url.origin)
  const baseUrlStr = baseUrl.toString()
  matcher(
    baseUrlStr,
    /https?:\/\/github.com\/(?<org>[\w%.-]+)\/(?<repo>[\w%.-]+)\/blob\/(?<ref>[\w%.-]+)\/(?<path>[\w/%.-]+)/,
  )
    .then((match) => {
      const {org, repo, ref, path} = match.groups
      parsed.type = SOURCE_TYPE.VCS
      parsed.target = {
        organization: org,
        repository: repo,
        ref: ref,
        url: new URL(`/${org}/${repo}/${ref}/${path}`, 'https://raw.githubusercontent.com'),
      }
    })
    .or(/\/share\/v\/gh\/(?<org>[\w.-]+)\/(?<repo>[\w.-]+)\/(?<ref>[\w.-]+)\/(?<path>[\w/%.-]+)/)
    .then((match) => {
      const {org, repo, ref, path} = match.groups
      parsed.type = SOURCE_TYPE.VCS
      parsed.target = {
        organization: org,
        repository: repo,
        ref: ref,
        url: new URL(`/${org}/${repo}/${ref}/${path}`, 'https://raw.githubusercontent.com'),
      }
    })
    .or(/\/share\/v\/p\/index.ifc/)
    .then(() => {
      parsed.type = SOURCE_TYPE.VCS
      parsed.target = {
        organization: 'bldrs-ai',
        repository: 'Share',
        ref: 'main',
        url: new URL(`/bldrs-ai/Share/main/public/index.ifc`, 'https://raw.githubusercontent.com'),
      }
    })
    .or(() => {
      parsed.type = SOURCE_TYPE.URL
      parsed.target = {
        url: parsed.original,
      }
    })
  return parsed
}


/**
 * @param {URL} url
 * @return {Array<number>}
 */
export function parseCoords(url) {
  let c = [0, 0, 0, 0, 0, 0]
  if (url.hash) {
    const params = url.hash.split('::')
    const paramsList = url.hash.substring(1).split('::')
    paramsList.forEach((p) => {
      const [k, v] = p.split(':', 2)
      params[k] = v
    })
    if ('c' in params) {
      c = params['c'].split(',').map((f) => parseFloat(f))
    }
  }
  return c
}


/**
 * Resolves the given urlStr to a downloadable form using GitHub's Contents API.
 *
 * For GitHub URLs (authed or not), returns either a direct download URL on
 * raw.githubusercontent.com / media.githubusercontent.com (the latter for
 * Git LFS), or inline base64 content for small files. For other hosts the URL
 * is returned unchanged.
 *
 * The third positional parameter is unused; kept for call-site compatibility
 * pending a follow-up rename + signature cleanup.
 *
 * @param {string} urlStr
 * @param {string} accessToken
 * @param {boolean} _isOpfsAvailable Unused. Kept for call-site compatibility.
 * @param {boolean} useCache
 * @return {Array<object>} [content, sha, isCacheHit, isBase64] where content is
 * either a download URL or base64-encoded inline content.
 */
export async function dereferenceAndProxyDownloadContents(urlStr, accessToken, _isOpfsAvailable, useCache = true) {
  const u = new URL(urlStr)
  switch (u.host.toLowerCase()) {
    case 'github.com':
      return await getGitHubPathContents(urlStr, accessToken, useCache)

    default:
      return [urlStr, '', false, false]
  }
}


/**
 * @param {string} urlStr
 * @param {string} accessToken
 * @param {boolean} useCache
 * @return {Array<string>} Quadruple of [downloadUrl, sha, isCacheHit, isBase64]
 */
async function getGitHubPathContents(urlStr, accessToken, useCache) {
  const repo = parseGitHubRepositoryUrl(urlStr)
  const {content, sha, isCacheHit, isBase64} = await getPathContents(
    {
      orgName: repo.owner,
      name: repo.repository,
    },
    repo.path,
    useCache,
    repo.ref,
    accessToken,
  )
  return [content, sha, isCacheHit, isBase64]
}
