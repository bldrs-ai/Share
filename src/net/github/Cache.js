// http request etag cache
let httpCache = null

const httpCacheApiAvailable = ('caches' in window)

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
    // fallback to caching only on current page, won't survive page reloads
    return {}
  }

  /**
   * Converts a cached response to an Octokit response format.
   *
   * @param {Response|null} cachedResponse - The cached response to convert.
   * @return {Promise<object | null>} A structured object mimicking an Octokit response, or null if the response is invalid.
   */
  async function convertToOctokitResponse(cachedResponse) {
    if (!cachedResponse) {
        return null // or handle this case as needed
    }

    const data = await cachedResponse.json() // assuming the response was stored as JSON
    const headers = cachedResponse.headers
    const status = cachedResponse.status

    // Create a structure that mimics an Octokit response
    const octokitResponse = {
        data: data, // the JSON payload
        status: status, // HTTP status code
        headers: {}, // reconstruct headers into an object
        url: cachedResponse.url, // includes the request URL
    }

    // Iterate over headers and add them to the response object
    headers.forEach((value, key) => {
        octokitResponse.headers[key] = value
    })

    return octokitResponse
  }

  /**
   * Checks the cache for a specific key and converts the response to an Octokit response format.
   *
   * @param {string} key - The key to search for in the cache.
   * @return {Promise<object | null>} The cached response in Octokit format, or null if not found or an error occurs.
   */
  export async function checkCache(key) {
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
 * Updates the cache entry for a given key with the response received.
 * The cache will only be updated if the response headers contain an ETag.
 *
 * @param {string} key - The cache key associated with the request.
 * @param {object} response - The HTTP response object from Octokit which includes headers and data.
 */
export async function updateCache(key, response) {
  if (response.headers.etag) {
    const _httpCache = await getCache()
    if (httpCacheApiAvailable) {
      // wrap the Octokit Response and store it
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
