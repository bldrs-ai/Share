import {assertDefined} from '../../utils/assert'
import {octokit} from './OctokitExport' // TODO(pablo): don't use octokit directly


/**
 * Retrieves organizations associated with the user
 *
 * @param {string} accessToken
 * @return {Promise} the list of organization
 */
export async function getOrganizations(accessToken) {
  assertDefined(accessToken)
  if (!accessToken || accessToken === '') {
    throw new Error('GitHub access token is required for this call')
  }

  const res = await octokit.request(`/user/orgs`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })

  return res.data
}
