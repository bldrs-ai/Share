import {assertDefined} from '../../utils/assert'
import {getGitHub} from './Http'


/**
 * @param {object} repository
 * @param {string} [accessToken]
 * @return {Promise<Array>}
 */
export async function getBranches(repository, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'branches', {}, accessToken)
  return res.data
}
