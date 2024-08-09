import {assertDefined} from '../../utils/assert'
import {octokit} from './OctokitExport' // TODO(pablo): don't use directly


/**
 * Retrieves repositories associated with an organization
 *
 * @param {string} org
 * @param {string} [accessToken]
 * @return {Promise} the list of organization
 */
export async function getRepositories(org, accessToken = '') {
  assertDefined(...arguments)
  const res = await octokit.request('GET /orgs/{org}/repos', {
    org,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
  return res.data
}


/**
 * Retrieves repositories associated with the authenticated user
 *
 * @param {string} [accessToken]
 * @return {Promise} the list of repositories
 */
export async function getUserRepositories(accessToken = '', org = '') {
  if ((accessToken === null || '') && (org === null || org === '') ) {
    throw new Error('One of accessToken or org must be valid')
  }
  let allRepos = []
  let page = 1
  let isDone = false
  const perPage = 100 // Max value is 100

  while (!isDone) {
    const res = await octokit.request('GET /user/repos', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      type: 'all',
      per_page: perPage,
      page: page,
    })

    // Filter out forks from the current page of results

    if (org === '') {
      const nonForkRepos = res.data.filter((repo) => !repo.fork)
      allRepos = allRepos.concat(nonForkRepos)
    } else {
      const nonForkRepos = res.data.filter((repo) => !repo.fork && repo.owner.login === org)
      allRepos = allRepos.concat(nonForkRepos)
    }

    if (res.data.length < perPage) {
      // If the number of repositories is less than 'perPage', it means we are on the last page
      isDone = true
      break
    }
    page++ // Go to the next page
  }

  return allRepos
}
