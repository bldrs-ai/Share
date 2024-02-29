import {assertDefined} from '../../utils/assert'
import {getGitHub, postGitHub, patchGitHub} from './Http'


/**
 * @param {object} repository
 * @param {object} payload issue payload shall contain title and body
 * @param {string} accessToken Github API OAuth access token
 * @return {object} response from GH
 */
export async function createIssue(repository, payload, accessToken = '') {
  assertDefined(...arguments)
  return await postGitHub(repository, 'issues', payload, accessToken)
}


/**
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} [accessToken]
 * @return {object} responce from GH with the closed issue object
 */
export async function closeIssue(repository, issueNumber, accessToken = '') {
  assertDefined(...arguments)
  const args = {
    issueNumber,
    state: 'closed',
  }
  return await patchGitHub(repository, `issues/{issueNumber}`, args, accessToken)
}


/**
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} [accessToken]
 * @return {object} response from GH sinle issue
 */
export async function getIssue(repository, issueNumber, accessToken = '') {
  assertDefined(...arguments)
  return await getGitHub(repository, 'issues/{issueNumber}', {issueNumber}, accessToken)
}


/**
 * @param {object} repository
 * @param {string} [accessToken]
 * @return {Array} Array of issues response from GH
 */
export async function getIssues(repository, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'issues', {}, accessToken)
  return res.data
}


/**
 * The comments should have the following structure:
 *
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} [accessToken]
 * @return {Array}
 */
export async function getIssueComments(repository, issueNumber, accessToken = '') {
  assertDefined(...arguments)
  const res = await getGitHub(repository, 'issues/{issueNumber}/comments', {issueNumber}, accessToken)
  return res.data
}


/**
 * @param {object} repository
 * @param {number} issueNumber
 * @param {string} title Issue/Note title
 * @param {string} body Issue/Note body
 * @param {string} accessToken
 * @return {object} response from GH
 */
export async function updateIssue(repository, issueNumber, title, body, accessToken) {
  assertDefined(...arguments)
  const args = {
    issue_number: issueNumber,
    body,
    title,
  }
  return await patchGitHub(repository, `issues/${issueNumber}`, args, accessToken)
}
