import {getProvider} from '../connections/registry'


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
 *   `'private'`, `'org'` (domain-only) and `null` (a domain grant whose
 *   domain can't be told) are private.
 * - The lookup failing, or no provider able to answer, counts as PRIVATE:
 *   today's behaviour, when every Drive file counted. Expect it to fail
 *   for some files: Drive can refuse `permissions.list` to a user who may
 *   only read the file, and then a link-shared file opened through a
 *   connection still counts (design/new/quotas.md §"Drive visibility" has
 *   the follow-up). Not reported to Sentry: it is an expected answer, not a
 *   defect.
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
  try {
    const provider = getProvider(connection.providerId)
    if (!provider?.getVisibility) {
      return DRIVE_VISIBILITY.PRIVATE
    }
    const visibility = await provider.getVisibility(connection, {kind: 'drive-file', fileId})
    return visibility === 'public' ? DRIVE_VISIBILITY.PUBLIC : DRIVE_VISIBILITY.PRIVATE
  } catch {
    return DRIVE_VISIBILITY.PRIVATE
  }
}
