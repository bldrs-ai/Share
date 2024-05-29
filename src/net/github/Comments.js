import {assertDefined} from '../../utils/assert'
import {getGitHub, patchGitHub, postGitHub, deleteGitHub} from './Http'


/**
 * Post issue to github
 * below for the expected structure.
 *
 * @param {object} repository
 * @param {number} issueNumber
 * @param {object} payload issue payload shall contain title and body
 * @param {string} accessToken
 * @return {object}
 */
export async function createComment(repository, issueNumber, payload, accessToken) {
  assertDefined(...arguments)
  const args = {
    ...payload,
    issueNumber,
  }
  const res = await postGitHub(repository, `issues/{issueNumber}/comments`, args, accessToken)
  return res
}


/**
 * @param {object} repository
 * @param {number} commentId
 * @param {string} [accessToken]
 * @return {object}
 */
export async function getComment(repository, commentId, accessToken = '') {
  assertDefined(...arguments)
  return await getGitHub(repository, 'issues/comments/{commentId}', {commentId}, accessToken)
}


/**
 * @param {object} repository
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getComments(repository, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'issues/comments', {}, accessToken)
  return res.data
}

/**
 * @param {object} repository - Repository object containing orgName and name.
 * @param {number} commentId - ID of the comment to be updated.
 * @param {string} body - New body of the comment.
 * @param {string} accessToken - GitHub access token.
 * @return {object} response from GitHub.
 */
export async function updateComment(repository, commentId, body, accessToken) {
  assertDefined(...arguments)

  const args = {
    body,
  }

  return await patchGitHub(repository, `issues/comments/${commentId}`, args, accessToken)
}


/**
 * @param {object} repository
 * @param {string} commentId
 * @param {string} accessToken
 * @return {object}
 */
export async function deleteComment(repository, commentId, accessToken) {
  assertDefined(...arguments)
  return await deleteGitHub(repository, `issues/comments/{commentId}`, {commentId}, accessToken)
}
