import {Octokit} from '@octokit/rest'
import {assertDefined} from '../../utils/assert'
import PkgJson from '../../../package.json'
import {checkCache, updateCache} from './Cache'


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
  } else {
    args.headers = {}
  }

  const cacheKey = `${repository.orgName}/${repository.name}/${path}`
  const cached = await checkCache(cacheKey)

  // If we have a cached ETag, add If-None-Match header
  if (cached && cached.headers && cached.headers.etag) {
    args.headers['If-None-Match'] = cached.headers.etag
  } else {
    args.headers['If-None-Match'] = ''
  }

  // we must use a try catch here because octokit throws an error on any status !== 200
  try {
    const response = await requestWithTimeout(octokit.request(`GET /repos/{org}/{repo}/${path}`, {
      org: repository.orgName,
      repo: repository.name,
      ...args,
    }))

    // Update cache with new data and ETag
    await updateCache(cacheKey, response)

    return response
  } catch (error) {
    const NOTMODIFIED = 304
    if (error.status === NOTMODIFIED) {
      // Handle 304 Not Modified
      // Return cached data if available
      if (cached) {
        return cached
      }
    }

    // Re-throw the error if it's not a 304
    throw error
  }
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
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  }
  return await requestWithTimeout(octokit.request(`POST /repos/{org}/{repo}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }))
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
  return await requestWithTimeout(octokit.request(`DELETE /repos/{org}/{repo}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }))
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
  return await requestWithTimeout(octokit.request(`PATCH /repos/${repository.orgName}/${repository.name}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }))
}


/**
 * Executes an Octokit request with a specified timeout.
 * If the request does not complete within the timeout period, it is aborted and a timeout error is thrown.
 *
 * @param {Promise} octokitRequest The Octokit request to be executed.
 * @param {number} [timeout=5000] The timeout in milliseconds before abort.
 * @return {Promise} Resolves with the result of the Octokit request if successful and within the timeout period.
 *   Rejects with an error if the request is aborted due to a timeout or if the Octokit request fails for any other reason.
 * @throws {Error} Throws a "Request timed out" error if the request does not complete within the specified timeout period.
 */
function requestWithTimeout(octokitRequest, timeout = 10000) { // Default timeout is 5000 ms
  return Promise.race([
    octokitRequest,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeout),
    ),
  ])
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
