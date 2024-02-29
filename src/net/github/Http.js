import {Octokit} from '@octokit/rest'
import {assertDefined} from '../../utils/assert'
import debug from '../../utils/debug'
import PkgJson from '../../../package.json'


/**
 * Fetch the resource at the given path from GitHub, substituting in the given args
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args to substitute
 * @param {string} [accessToken]
 * @return {object} The object at the resource
 */
export async function getGitHub(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const res = await octokit.request(`GET /repos/{org}/{repo}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  })
  return res
}


/**
 * Post the resource to the GitHub
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args for posting
 * @param {string} [accessToken]
 * @return {object} The object at the resource
 */
export async function postGitHub(repository, path, args = {}, accessToken = '') {
  debug().log('GitHub#postGitHub: args: ', args)
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const requestStr = `POST /repos/{org}/{repo}/${path}`
  debug().log('GitHub#postGitHub: requestStr: ', requestStr)
  const requestObj = {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }
  debug().log('GitHub#postGitHub: requestObj: ', requestObj)
  const res = await octokit.request(requestStr, requestObj)
  return res
}


/**
 * Delete the resource to the GitHub
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args for posting
 * @param {string} [accessToken]
 * @return {object} Result
 */
export async function deleteGitHub(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  const requestStr = `DELETE /repos/{org}/{repo}/${path}`
  debug().log('GitHub#deleteGitHub: requestStr: ', requestStr)
  const requestObj = {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }
  debug().log('GitHub#deleteGitHub: requestObj: ', requestObj)
  const res = await octokit.request(requestStr, requestObj)
  return res
}


/**
 * Patch the resource
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args for patching
 * @param {string} [accessToken]
 * @return {object} The object at the resource
 */
export async function patchGitHub(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  debug().log('Dispatching GitHub request for repo:', repository)
  const res = await octokit.request(`PATCH /repos/${repository.orgName}/${repository.name}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  })
  return res
}


const GITHUB_BASE_URL = process.env.GITHUB_BASE_URL
// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
export const octokit = new Octokit({
  baseUrl: GITHUB_BASE_URL,
  userAgent: `bldrs/${PkgJson.version}`,
  // This comment instructs GitHub to always use the latest response instead of using a cached version. Especially relevant for notee.
  // https://github.com/octokit/octokit.js/issues/890#issuecomment-392193948 the source of the solution
  headers: {
    'If-None-Match': '',
  },
})
