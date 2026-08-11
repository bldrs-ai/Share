import {assertDefined} from '../../utils/assert'
import {octokit} from './OctokitExport' // TODO(pablo): don't use directly


/**
 * Retrieves repositories associated with an organization.
 *
 * Paginates the full org repo list (GitHub caps a page at 100) and asks
 * for `type: 'all'`, so private repos the authenticated user can see are
 * included — without pagination only the first page (default 30) came
 * back, so private / alphabetically-late repos (e.g. `test-models-private`)
 * silently fell off the list and read as "No match" in the chooser.
 *
 * @param {string} org
 * @param {string} [accessToken]
 * @return {Promise} the list of organization repositories
 */
export async function getRepositories(org, accessToken = '') {
  assertDefined(...arguments)
  const allRepos = []
  let page = 1
  const perPage = 100 // Max value is 100

  for (;;) {
    const res = await octokit.request('GET /orgs/{org}/repos', {
      org,
      // `all` (the authenticated default) returns private repos the token
      // can access alongside public ones; set explicitly so the intent is
      // clear and stable if the API default ever changes.
      type: 'all',
      per_page: perPage,
      page: page,
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    })
    allRepos.push(...res.data)
    if (res.data.length < perPage) {
      // A short page means we've reached the last one.
      break
    }
    page++
  }
  return allRepos
}


/**
 * Retrieves repositories associated with the authenticated user
 *
 * @param {string} accessToken
 * @param {string} org
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
