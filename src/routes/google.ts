import {assertDefined} from '../utils/assert'
import type {ProviderResult} from './routes'


/**
 * Processes a Google Drive URL and returns the fileId if found.
 *
 * @param originalUrl
 * @param maybeGoogleUrl - The Google Drive URL to process
 * @return Object with provider and fileId
 */
export default function processGoogleUrl(originalUrl: URL, maybeGoogleUrl: URL): GoogleResult | null {
  if (!/\.google\.com$/i.test(maybeGoogleUrl.hostname) &&
      maybeGoogleUrl.hostname !== 'www.googleapis.com') {
    return null
  }

  let fileId: string | null = null
  let pathMatch
  if ((pathMatch = maybeGoogleUrl.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})\/.*/))) {
    // Handle https://drive.google.com/file/d/0B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
    fileId = pathMatch[1]
  } else if ((pathMatch = maybeGoogleUrl.pathname.match(/\/drive\/v3\/files\/([A-Za-z0-9_-]{10,})/))) {
    // Handle https://www.googleapis.com/drive/v3/files/0B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
    fileId = pathMatch[1]
  } else if (maybeGoogleUrl.pathname.startsWith('/uc')) {
    // handle https://drive.google.com/uc?id=4sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO&export=download
    fileId = maybeGoogleUrl.searchParams.get('id')
  } else {
    return null
  }

  if (!fileId || !isValidDriveId(fileId)) {
    return null
  }

  const rk = maybeGoogleUrl.searchParams.get('resourcekey') || undefined
  const rkOk = rk && isValidDriveResourceKey(rk) ? rk : undefined

  const result: GoogleResult = {
    originalUrl,
    kind: 'provider',
    provider: 'google',
    fileId,
    downloadUrl: getDownloadUrl(fileId),
    ...(rkOk ? {resourceKey: rkOk} : {}),
  }

  return result
}


/**
 * Gets the download URL for a Google Drive file.
 *
 * @param fileId - The Google Drive file ID.
 * @return The download URL.
 */
function getDownloadUrl(fileId: string): URL {
  assertDefined(fileId)
  const GOOGLE_API_KEY = 'AIzaSyDBunWqj2zJAqXxJ6wV9BfSd-8DvJaKNpQ'
  return new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`)
}


/**
 * Checks if a Drive ID is valid.
 *
 * @param id - The Drive ID to check.
 * @return True if the Drive ID is valid, false otherwise.
 */
function isValidDriveId(id: string): boolean {
  return DRIVE_FILE_ID_RE.test(id)
}


/**
 * Checks if a Drive resource key is valid.
 *
 * @param rk - The Drive resource key to check.
 * @return True if the Drive resource key is valid, false otherwise.
 */
function isValidDriveResourceKey(rk: string): boolean {
  return DRIVE_RESOURCE_KEY_RE.test(rk)
}

// Constants
/**
 * File IDs: case-sensitive, URL-safe base64-ish, usually ~28–33 chars.
 * We accept 25–44 to be tolerant across Google variants.
 */
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{25,44}$/

/**
 * Resource keys commonly look like "0-<token>"
 * Be tolerant: 1–3 alnum "version" chars, a hyphen, then a URL-safe token.
 */
const DRIVE_RESOURCE_KEY_RE = /^[A-Za-z0-9]{1,3}-[A-Za-z0-9_-]{6,}$/

// Types
export interface GoogleResult extends ProviderResult {
  provider: 'google'
  fileId: string
  downloadUrl: URL
  resourceKey?: string
}
