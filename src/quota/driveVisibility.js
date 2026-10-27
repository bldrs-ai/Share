import {getProvider} from '../connections/registry'
import {getGoogleMetadataUrl} from '../routes/google'


/**
 * How a Drive file counts toward the quota: public files are never metered,
 * private ones are (design/new/quotas.md §"Drive visibility").
 */
export const DRIVE_VISIBILITY = Object.freeze({
  PUBLIC: 'public',
  PRIVATE: 'private',
})


/**
 * Whether a Drive file the user just opened is public or private, for
 * metering. Private means the viewer can see it only because Google
 * authorizes THEM: the file is shared with their account (or their
 * Workspace domain). A file anyone with the link can open is public, like a
 * public GitHub repo.
 *
 * - `connection` null: the file was downloaded with the app's API key and no
 *   user token (CadView#loadModel's no-connection path). That download only
 *   succeeds for a file shared "Anyone with the link" (or published), so the
 *   file is public, and no lookup is needed.
 * - With a connection: the provider's visibility lookup
 *   (GoogleDriveSharing#driveGetVisibility, which reduces the file's
 *   permission list). `'public'` (an `anyone` permission) is public;
 *   `'private'` and `'org'` (domain-only) are private; `null` (a domain
 *   grant whose domain can't be told) is no verdict, see below.
 * - The lookup failing, no provider able to answer, or the answer `null`
 *   is not a verdict. Expect it for some files: Drive refuses
 *   `permissions.list` to a user who may only read the file, so a
 *   link-shared file opened through a connection by a non-owner fails the
 *   lookup. One more check settles it: fetch the file's metadata with the
 *   app's API key and no user token (`isLinkShared`). It succeeds only for a
 *   file anyone with the link can open, which is public. If that fails too,
 *   the file counts as PRIVATE, as before. A lookup that ANSWERED
 *   (`'public'`, `'private'`, `'org'`) is never second-guessed and costs no
 *   API-key call. Failures are not reported to Sentry: they are expected
 *   answers, not defects.
 *
 * Never rejects, so a caller can await it inside a gate without a catch.
 *
 * @param {object|null} connection the google-drive Connection the file was
 *   downloaded with, or null for an API-key download
 * @param {string} fileId Drive file id
 * @return {Promise<string>} one of DRIVE_VISIBILITY.*
 */
export async function driveFileQuotaVisibility(connection, fileId) {
  if (connection === null) {
    return DRIVE_VISIBILITY.PUBLIC
  }
  let visibility = null
  try {
    const provider = getProvider(connection.providerId)
    visibility = provider?.getVisibility ?
      await provider.getVisibility(connection, {kind: 'drive-file', fileId}) :
      null
  } catch {
    // Same as no answer: fall through to the API-key check.
  }
  if (visibility === 'public') {
    return DRIVE_VISIBILITY.PUBLIC
  }
  if (visibility === null && await isLinkShared(fileId)) {
    return DRIVE_VISIBILITY.PUBLIC
  }
  return DRIVE_VISIBILITY.PRIVATE
}


// A hung request must not hold the open or the load's meter call; a timeout
// reads as "not link-shared", i.e. today's private count.
const LINK_SHARED_CHECK_TIMEOUT_MS = 5000


/**
 * Whether anyone with the link can read the file: its metadata is readable
 * with the app's API key alone. Same key and same access rule as CadView's
 * no-connection download, without moving the file. The decision stays on the
 * client, which is all that is sent to record-load (design/new/quotas.md
 * §"Drive visibility", "Server trust"). Never rejects.
 *
 * @param {string} fileId Drive file id
 * @return {Promise<boolean>} true only on a successful response
 */
async function isLinkShared(fileId) {
  // No key built in (a local build without GOOGLE_API_KEY): the URL would
  // carry "key=undefined", so don't ask.
  if (!process.env.GOOGLE_API_KEY) {
    return false
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LINK_SHARED_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(getGoogleMetadataUrl(fileId).toString(), {signal: controller.signal})
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
