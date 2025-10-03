import type {ProviderResult} from './routes'


/**
 * Processes a Google Drive URL and returns the fileId if found.
 *
 * @param maybeGoogleUrl - The Google Drive URL to process
 * @return Object with provider and fileId
 */
export default function processGoogleUrl(maybeGoogleUrl: URL): GoogleResult | null {
  let u: URL
  try {
    u = new URL(maybeGoogleUrl)
  } catch {
    return null
  }
  if (!/\.google\.com$/i.test(u.hostname) && u.hostname !== 'www.googleapis.com') {
    return null
  }

  let fileId: string | null = null
  let pathMatch
  if ((pathMatch = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/))) {
    // Handle https://drive.google.com/file/d/0B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
    fileId = pathMatch[1]
  } else if ((pathMatch = u.pathname.match(/\/drive\/v3\/files\/([A-Za-z0-9_-]{10,})/))) {
    // Handle https://www.googleapis.com/drive/v3/files/0B1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
    fileId = pathMatch[1]
  } else if (u.pathname.startsWith('/uc')) {
    // handle https://drive.google.com/uc?id=4sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO&export=download
    fileId = u.searchParams.get('id')
  } else {
    return null
  }

  if (!fileId || !isValidDriveId(fileId)) {
    return null
  }

  const rk = u.searchParams.get('resourcekey') || undefined
  const rkOk = rk && isValidDriveResourceKey(rk) ? rk : undefined

  const result: GoogleResult = {
    sourceUrl: new URL(maybeGoogleUrl),
    kind: 'provider',
    provider: 'google',
    fileId,
    ...(rkOk ? {resourceKey: rkOk} : {}),
  }

  return result
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
  resourceKey?: string
}
