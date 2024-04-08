import debug from '../../utils/debug'
import {assertDefined} from '../../utils/assert'
import {getGitHub} from './Http'


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

  // Prepare the repository object for getGitHub
  const repository = {
    orgName: owner,
    name: repo,
  }

  // Prepare the args object for getGitHub
  const args = {
    sha: branch,
    path: filePath,
  }

  const res = await getGitHub(repository, 'commits', args, accessToken)

  if (res.data.length === 0) {
    debug().warn('No commits found for the specified file.')
    return null
  }

  const latestCommitHash = res.data[0].sha
  debug().log(`The latest commit hash for the file is: ${latestCommitHash}`)
  return latestCommitHash
}
