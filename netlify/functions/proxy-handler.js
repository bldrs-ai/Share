/**
 * This function is used to proxy requests to Google Drive.
 * It is used to bypass the CORS policy of Google Drive.
 * It is also used to compress the response from Google Drive.
 * It is also used to cache the response from Google Drive.
 * It is also used to serve the response from Google Drive.
 *
 * @param {Request} req - The incoming request
 * @return {Promise<Response>} The proxied response
 */
export default async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return new Response('Missing file ID', {status: 400})
  }

  const origin = req.headers.get('origin') || ''
  const isAllowedOrigin =
    origin === 'https://bldrs.ai' ||
    origin === 'http://localhost:8080' ||
    /^https:\/\/deploy-preview-\d+--bldrs-share\.netlify\.app$/.test(origin)

  const downloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`

  const driveResponse = await fetch(downloadUrl, {
    headers: {
      'Accept-Encoding': 'gzip, deflate, br',
    },
  })

  if (!driveResponse.ok) {
    return new Response('Failed to fetch file from Google Drive', {status: 502})
  }

  const headers = new Headers(driveResponse.headers)
  headers.set('Access-Control-Allow-Origin', isAllowedOrigin ? origin : 'https://bldrs.ai')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')

  return new Response(driveResponse.body, {
    status: driveResponse.status,
    headers,
  })
}
