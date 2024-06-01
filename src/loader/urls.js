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
