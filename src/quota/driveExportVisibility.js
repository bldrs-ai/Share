import {modelOpenId} from '../routes/modelOpen'
import {DRIVE_VISIBILITY, driveFileQuotaVisibility} from './driveVisibility'


// fileId + how it was downloaded → the in-flight or settled answer. One
// lookup per file per OPEN (routes/modelOpen.ts): the Export tab and every
// export of the file ask, and a theme rebuild is the same open. A new open
// asks again, so an in-app return to a file whose sharing changed meanwhile
// is classified as a page load would have it (open-205, #2022).
const answers = new Map()
let answersOpen = 0


/**
 * Whether the loaded model is a Drive file the CLIENT finds public ("Anyone
 * with the link"), for an export: the word `pro-module` and `record-export`
 * take for Drive (`X-Bldrs-Drive-Public`, exportSlots.js), since the server
 * can't see Drive sharing. The classification is the one record-load's
 * callers already make, `driveVisibility.js#driveFileQuotaVisibility`, on
 * the same input — how CadView downloaded the file (its connection, or none
 * for an API-key download) — so an open and an export of one file can't be
 * classified differently (design/new/quotas.md §"Drive visibility").
 *
 * Never rejects: no answer is false, i.e. private, which takes a slot — the
 * same safe default record-load's callers use.
 *
 * @param {?object} modelPath The store's `modelPath`
 * @param {?{fileId: string, connection: ?object}} driveDownload The store's
 *   `modelDriveDownload`, what CadView downloaded the file with
 * @return {Promise<boolean>}
 */
export function isDriveModelPublic(modelPath, driveDownload) {
  const fileId = modelPath?.provider === 'google' ? modelPath.fileId : null
  if (!fileId || !driveDownload || driveDownload.fileId !== fileId) {
    return Promise.resolve(false)
  }
  const open = modelOpenId(modelPath)
  if (open !== answersOpen) {
    answers.clear()
    answersOpen = open
  }
  const memoKey = `${fileId}\u0000${driveDownload.connection ? 'connection' : 'api-key'}`
  if (!answers.has(memoKey)) {
    answers.set(memoKey, driveFileQuotaVisibility(driveDownload.connection, fileId)
      .then((visibility) => visibility === DRIVE_VISIBILITY.PUBLIC, () => false))
  }
  return answers.get(memoKey)
}


/** Tests only: forget the answers. */
export function resetDriveExportVisibility() {
  answers.clear()
  answersOpen = 0
}
