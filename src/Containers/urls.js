import {getDownloadUrl, getPathContents} from '../net/github/Files'
import {parseGitHubRepositoryUrl} from '../net/github/utils'


/**
 * @param {string} url
 * @param {string} accessToken
 * @return {string} The url
 */
export async function getFinalUrl(url, accessToken) {
  const u = new URL(url)
  switch (u.host.toLowerCase()) {
    case 'github.com':
      if (!accessToken) {
        const proxyUrl = new URL(process.env.RAW_GIT_PROXY_URL)

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

        return u.toString()
      }

      return await getGitHubDownloadUrl(url, accessToken)

    default:
      return url
  }
}

/**
 *
 */
export async function getFinalDownloadData(url, accessToken, isOpfsAvailable) {
  const u = new URL(url)

  switch (u.host.toLowerCase()) {
    case 'github.com':
      if (!accessToken) {
        const proxyUrl = new URL(isOpfsAvailable ? process.env.RAW_GIT_PROXY_URL : process.env.RAW_GIT_PROXY_URL_FALLBACK)

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

        return [u.toString(), '']
      }

      return await getGitHubPathContents(url, accessToken)

    default:
      return [url, '']
  }
}


/**
 * @param {string} url
 * @param {string} accessToken
 * @return {string} The url
 */
async function getGitHubDownloadUrl(url, accessToken) {
  const repo = parseGitHubRepositoryUrl(url)
  const downloadUrl = await getDownloadUrl(
    {
      orgName: repo.owner,
      name: repo.repository,
    },
    repo.path,
    repo.ref,
    accessToken,
  )
  return downloadUrl
}

/**
 *
 */
async function getGitHubPathContents(url, accessToken) {
  const repo = parseGitHubRepositoryUrl(url)
  const [downloadUrl, sha] = await getPathContents(
    {
      orgName: repo.owner,
      name: repo.repository,
    },
    repo.path,
    repo.ref,
    accessToken,
  )
  return [downloadUrl, sha]
}
