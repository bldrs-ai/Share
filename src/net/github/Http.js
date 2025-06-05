import {assertDefined} from '../../utils/assert'
import {HTTP_NOT_MODIFIED} from '../http'
import {checkCache, updateCache} from './Cache'
import {octokit} from './OctokitExport'


/**
 * Fetch the resource at the given path from GitHub, optionally using cache checks (ETag).
 *
 * @param {object}  repository
 * @param {string}  path The resource path with arg substitution markers, e.g. `contents/{path}?ref={ref}`
 * @param {object}  args The args to substitute (e.g. { path: 'myfile', ref: 'main' })
 * @param {boolean} useCache Whether to enable ETag caching logic
 * @param {string}  [accessToken] (Optional) Token for private repos
 * @return {object} { response, isCacheHit }
 */
export async function getGitHubResource(repository, path, args = {}, useCache = false, accessToken = '') {
  assertDefined(repository.orgName, repository.name)

  // Ensure headers exist
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  } else {
    args.headers = {...args.headers}
  }


  // Will set to true if we end up using a 304/cached response
  let isCacheHit = false
  let cacheKey
  let cached

  if (useCache) {
    cacheKey = `${repository.orgName}/${repository.name}/${path}`
    cached = await checkCache(cacheKey)

    // If we have a cached ETag, send 'If-None-Match' to possibly get a 304
    if (cached?.headers?.etag) {
      args.headers['If-None-Match'] = cached.headers.etag
    } else {
      args.headers['If-None-Match'] = ''
    }
  }

  try {
    // Use octokit to fetch the resource
    const response = await requestWithTimeout(
      octokit.request(`GET /repos/{org}/{repo}/${path}`, {
        org: repository.orgName,
        repo: repository.name,
        ...args,
        // Octokit will encode the path when it makes the request, so we need to decode it here.
        path: decodeURI(args.path),
      }),
    )

    // If we used cache logic and got a fresh 200 OK, update cache
    if (useCache) {
      await updateCache(cacheKey, response)
    }

    return {
      response,
      isCacheHit,
    }
  } catch (error) {
    if (useCache && error.status === HTTP_NOT_MODIFIED) {
      // We got a 304 Not Modified, meaning we can safely use our cached copy
      if (cached) {
        isCacheHit = true
        return {
          response: cached,
          isCacheHit,
        }
      }
    }
    // If it wasn't a 304 or we have no cached copy, rethrow the error
    throw error
  }
}

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
    if (error.status === HTTP_NOT_MODIFIED) {
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
 * Fetch the resource at the given path from GitHub, substituting in the given args.
 * Disable caching, some endpoints on GitHub use the file hash as the ETAG, yet
 * return signed download URLs that will expire. Because of this, if you send
 * an ETAG up to the server after caching a the HTTP response once, you will not be
 * able to query it again.
 *
 * @param {object} repository
 * @param {object} path The resource path with arg substitution markers
 * @param {object} args The args to substitute
 * @param {string} [accessToken]
 * @return {object} The object at the resource
 */
export async function getGitHubNoCache(repository, path, args = {}, accessToken = '') {
  assertDefined(repository.orgName, repository.name)
  if (accessToken) {
    args.headers = {
      authorization: `Bearer ${accessToken}`,
      ...args.headers,
    }
  } else {
    args.headers = {}
  }

  const response = await requestWithTimeout(octokit.request(`GET /repos/{org}/{repo}/${path}`, {
    org: repository.orgName,
    repo: repository.name,
    ...args,
  }))

  return response
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
