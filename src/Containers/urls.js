import {
  getDownloadURL,
  parseGitHubRepositoryURL,
} from '../utils/GitHub'


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
        const proxyURL =
          new URL(process.env.RAW_GIT_PROXY_URL || 'https://raw.githubusercontent.com')

        // Replace the protocol, host, and hostname in the target
        u.protocol = proxyURL.protocol
        u.host = proxyURL.host
        u.hostname = proxyURL.hostname

        // If the port is specified, replace it in the target URL
        if (proxyURL.port) {
          u.port = proxyURL.port
        }

        // If there's a path, *and* it's not just the root, then prepend it to the target URL
        if (proxyURL.pathname && proxyURL.pathname !== '/') {
          u.pathname = proxyURL.pathname + u.pathname
        }

        return u.toString()
      }

      return await getGitHubDownloadURL(url, accessToken)

    default:
      return url
  }
}


/**
 * @param {string} url
 * @param {string} accessToken
 * @return {string} The url
 */
async function getGitHubDownloadURL(url, accessToken) {
  const repo = parseGitHubRepositoryURL(url)
  const downloadURL = await getDownloadURL(
    {
      orgName: repo.owner,
      name: repo.repository,
    },
    repo.path,
    repo.ref,
    accessToken,
  )
  return downloadURL
}
