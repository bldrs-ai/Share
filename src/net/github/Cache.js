/**
 * This module implements an etag caching system for network requests
 * using the browser Cache API.
 * This module was rewritten to support ES6 + CommonJS for Web-Workers
 * using the UMD (Universal Module Definition) pattern.
 *
 * Usage:
 *    1. ES6 Main Thread:
 *      import {checkCache} from './Cache'
 *      ...
 *      checkCache("test")
 *    2. CommonJS (Web Worker):
 *      importScripts('./Cache.js');
 *      ...
 *      CacheModule.checkCache("test")
 */

(function(root, factory) {
  // eslint-disable-next-line no-undef
  if (typeof define === 'function' && define.amd) {
    // AMD
    // eslint-disable-next-line no-undef
    define([], factory)
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory()
  } else {
    // Browser globals
    root.CacheModule = factory()
  }
  // eslint-disable-next-line no-invalid-this
}(typeof self !== 'undefined' ? self : this, function() {
  // http request etag cache
  let httpCache = null

  const httpCacheApiAvailable = (typeof caches !== 'undefined')

  /**
   * Retrieves the HTTP cache, opening it if it doesn't already exist.
   *
   * @return {Promise<Cache | object>} The HTTP cache object.
   */
  async function getCache() {
    if (!httpCache) {
      httpCache = await openCache()
    }
    return httpCache
  }

  /**
   * Opens the HTTP cache if the Cache API is available.
   *
   * @return {Promise<Cache | object>} A Cache object if the Cache API is available, otherwise an empty object.
   */
  async function openCache() {
    if (httpCacheApiAvailable) {
      return await caches.open('bldrs-github-api-cache')
    }
    return {}
  }

  /**
   * Converts a cached response to an Octokit response format.
   *
   * @param {Response|null} cachedResponse The cached response to convert.
   * @return {Promise<object | null>} A structured object mimicking an Octokit response, or null if the response is invalid.
   */
  async function convertToOctokitResponse(cachedResponse) {
    if (!cachedResponse) {
      return null
    }

    const data = await cachedResponse.json()
    const headers = cachedResponse.headers
    const status = cachedResponse.status

    const octokitResponse = {
      data: data,
      status: status,
      headers: {},
      url: cachedResponse.url,
    }

    headers.forEach((value, key) => {
      octokitResponse.headers[key] = value
    })

    return octokitResponse
  }

  /**
   * Checks the cache for a specific key and converts the response to an Octokit response format.
   *
   * @param {string} key The key to search for in the cache.
   * @return {Promise<object | null>} The cached response in Octokit format, or null if not found or an error occurs.
   */
  async function checkCache(key) {
    try {
      if (httpCacheApiAvailable) {
        const _httpCache = await getCache()
        const response = await _httpCache.match(key)
        return await convertToOctokitResponse(response)
      } else {
        return httpCache[key]
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Checks the cache for a specific key and converts the response to an Octokit response format.
   *
   * @param {string} key The key to search for in the cache.
   * @return {Promise<object | null>} The cached response, or null if not found or an error occurs.
   */
  async function checkCacheRaw(key) {
    try {
      if (httpCacheApiAvailable) {
        const _httpCache = await getCache()
        const response = await _httpCache.match(key)
        return response
      } else {
        return httpCache[key]
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Updates the cache entry for a given key with the response received.
   * The cache will only be updated if the response headers contain an ETag.
   *
   * @param {string} key The cache key associated with the request.
   * @param {object} response The HTTP response object from Octokit which includes headers and data.
   */
  async function updateCache(key, response) {
    if (response.headers.etag) {
      const _httpCache = await getCache()
      if (httpCacheApiAvailable) {
        const body = JSON.stringify(response.data)
        const wrappedResponse = new Response(body)
        wrappedResponse.headers.set('etag', response.headers.etag)
        _httpCache.put(key, wrappedResponse)
      } else {
        _httpCache[key] = {
          response: response,
        }
      }
    }
  }

  /**
   * @param {string} key - Cache key
   */
  async function deleteCache(key) {
    const _httpCache = await getCache()

    const success = await _httpCache.delete(key)

    if (success) {
      // eslint-disable-next-line no-console
      console.log(`Deleted ${key} from cache`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`Failed to delete ${key} from cache`)
    }
  }

  /**
   * Updates the cache entry for a given key with the response received.
   * The cache will only be updated if the response headers contain an ETag.
   *
   * @param {string} key The cache key associated with the request.
   * @param {object} response The HTTP raw response object which includes headers and data.
   * @param {string} commitHash The commit hash
   */
  async function updateCacheRaw(key, response, commitHash) {
    const _httpCache = await getCache()
    if (httpCacheApiAvailable) {
      // Create a new Response with the body and headers from the original response
      const headers = new Headers(response.headers) // Clone existing headers
      if (commitHash !== null) {
        headers.set('CommitHash', commitHash) // Set the new header
      }
      const wrappedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers, // Use the updated headers
      })
      await _httpCache.put(key, wrappedResponse)
    } else {
      // Create a new Response with the body and headers from the original response
      const headers = new Headers(response.headers) // Clone existing headers
      if (commitHash !== null) {
        headers.set('CommitHash', commitHash) // Set the new header
      }
      const wrappedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers, // Use the updated headers
      })
      _httpCache[key] = {
        response: wrappedResponse,
      }
    }
  }

  // Export the functions
  return {
    getCache,
    convertToOctokitResponse,
    checkCache,
    checkCacheRaw,
    updateCache,
    updateCacheRaw,
    deleteCache,
  }
}))
