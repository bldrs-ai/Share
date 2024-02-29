import debug from '../../utils/debug'
import {assertDefined} from '../../utils/assert'
import {getGitHub, octokit} from './Http' // TODO(pablo): don't use octokit directly


/**
 * @param {object} repository
 * @param {string} filepath
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getCommitsForFile(repository, filepath, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, `commits`, {
    path: filepath,
  }, accessToken)
  return res.data
}


/**
 * Gets the latest commit hash for a github filepath
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @param {string} accessToken
 * @param {string} [branch]
 * @return {string} latestCommitHash
 */
export async function getLatestCommitHash(owner, repo, filePath, accessToken, branch = 'main') {
  assertDefined(...arguments)
  let commits = null
  const requestOptions = {
    path: filePath,
    headers: {},
  }

  // Add the authorization header if accessToken is provided
  if (accessToken !== '') {
    requestOptions.headers.authorization = `Bearer ${accessToken}`
  }

  // Add the branch (sha) to the request if provided
  if (branch && branch !== '') {
    requestOptions.sha = branch
  }

  commits = await octokit.request(`GET /repos/${owner}/${repo}/commits`, requestOptions)

  if (commits.data.length === 0) {
    debug().warn('No commits found for the specified file.')
    return null
  }

  const latestCommitHash = commits.data[0].sha
  debug().log(`The latest commit hash for the file is: ${latestCommitHash}`)
  return latestCommitHash
}
