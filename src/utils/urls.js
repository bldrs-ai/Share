/**
 * Gets the final URL needed to load an IFC model
 *
 * This entire function is Github-specific.
 *
 * When additional Git hosting providers are supported, this function
 * will need expansion and/or refactoring for the different cases.
 * @param {string} originalURL
 * @return {Promise<string|*>}
 */
export async function resolveModelURL(originalURL) {
  // If we're passed a bare path, then do nothing.
  if (originalURL.startsWith('/')) {
    return originalURL
  }

  // If this is already a blob'ified URL, then do nothing.
  const url = new URL(originalURL)
  if (url.protocol === 'blob:') {
    return originalURL
  }

  // Fire a HEAD request against the given URL
  // Throw an exception if we don't receive a 200 OK
  const headResponse = await fetch(originalURL, {method: 'HEAD'})
  if (!headResponse.ok) {
    throw new Error(`Invalid IFC model URL (file server returned ${headResponse.status} ${headResponse.statusText})`)
  }

  // If the MIME type isn't text/plain, then there's no need to perform any URL magic
  const mimeType = headResponse.headers.get('content-type')
  if (!mimeType.startsWith('text/plain')) {
    return originalURL
  }

  // Perform a range request in an attempt to get LFS header
  const rangeResponse = await fetch(originalURL, {headers: {range: 'bytes=1-64'}})
  const rangeBody = await rangeResponse.text()
  if (rangeBody.startsWith('version https://git-lfs.github.com/spec/v1')) {
    // Return the translated Github LFS media download URL
    return `https://media.githubusercontent.com/media${url.pathname}`
  }

  return originalURL
}
