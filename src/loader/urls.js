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
    .then((match) => {
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
 * Dereferences and inserts proxying as needed (e.g. to follow LFS pointers) for
 * given urlStr, to determine what download URL to use.
 *
 * @param {string} urlStr
 * @param {string} accessToken
 * @param {boolean} isOpfsAvailable
 * @return {Array<string>} A tuple of urlStr (changed to our proxy if
 * github.com) and a sha if available.
 */
export async function dereferenceAndProxyDownloadUrl(urlStr, accessToken, isOpfsAvailable, useCache = true) {
  const u = new URL(urlStr)
  switch (u.host.toLowerCase()) {
    case 'github.com':
      if (!accessToken) {
        const proxyUrl = new URL(isOpfsAvailable ? process.env.RAW_GIT_PROXY_URL_NEW : process.env.RAW_GIT_PROXY_URL)

        // Replace the protocol, host, and hostname in the target
        u.protocol = proxyUrl.protocol
        u.host = proxyUrl.host
        u.hostname = proxyUrl.hostname

        // If the port is specified, replace it in the target URL
        if (proxyUrl.port) {
          u.port = proxyUrl.port
        }

        // If there's a path, *and* it's not just the root, then prepend it to the target URL
        if (proxyUrl.pathname && proxyUrl.pathname !== '/') {
          u.pathname = proxyUrl.pathname + u.pathname
        }

        return [u.toString(), '', false]
      }

      return await getGitHubPathContents(urlStr, accessToken, useCache)

    default:
      return [urlStr, '', false]
  }
}


/**
 * @param {string} urlStr
 * @param {string} accessToken
 * @return {Array<string>} Pair of [downloadUrl, sha]
 */
async function getGitHubPathContents(urlStr, accessToken, useCache) {
  const repo = parseGitHubRepositoryUrl(urlStr)
  const [downloadUrl, sha, cacheHit] = await getPathContents(
    {
      orgName: repo.owner,
      name: repo.repository,
    },
    repo.path,
    useCache,
    repo.ref,
    accessToken,
  )
  return [downloadUrl, sha, cacheHit]
}
