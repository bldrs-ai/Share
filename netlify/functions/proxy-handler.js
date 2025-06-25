/**
 * Proxy handler for Google Drive files.
 *
 * @param {object} event - The event object.
 * @param {object} event.queryStringParameters - The query string parameters.
 * @param {string} event.queryStringParameters.id - The file ID.
 * @return {Promise<object>} - The response object.
 */
export async function handler(event) {
  const {id} = event.queryStringParameters
  if (!id) {
    return {
      statusCode: 400,
      body: 'Missing file ID',
    }
  }
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`
  // Would be nice to stream this, but Netlify limits streaming size to 20MB for now (beta, Jun'25).
  // https://docs.netlify.com/functions/get-started/?fn-language=ts
  const driveResponse = await fetch(downloadUrl)
  const buffer = await driveResponse.arrayBuffer()
  const contentType = driveResponse.headers.get('content-type') || 'application/octet-stream'
  const origin = event.headers.origin
  const isAllowedOrigin = (
    origin === 'https://bldrs.ai' ||
    origin === 'http://localhost:8080' ||
    /^https:\/\/deploy-preview-\d+--bldrs-share\.netlify\.app$/.test(origin)
  )
  const HTTP_OK = 200
  return {
    statusCode: HTTP_OK,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://bldrs.ai',
    },
    // Should b64 for Netlify: https://docs.netlify.com/functions/lambda-compatibility/?fn-language=ts
    body: Buffer.from(buffer).toString('base64'),
    isBase64Encoded: true,
  }
}
