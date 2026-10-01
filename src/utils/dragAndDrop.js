import {guessTypeFromFile} from '../Filetype'
import {NO_OPFS_LOCAL_FILE_ALERT, noOpfsLocalFileAlert} from '../OPFS/messages'
import {checkOPFSAvailability, saveDnDFileToOpfs} from '../OPFS/utils'
import {addRecentFileEntry, setPendingModelNameUpdate} from '../connections/persistence'
import {inflateIfGzipEnvelope} from '../loader/gzipEnvelope'
import {disablePageReloadApprovalCheck} from './event'
import {trackAlert} from './alertTracking'
import {navigateToModel} from './navigate'
import debug, {WARN} from './debug'


/**
 * Handles drag and drop file upload with validation and processing
 *
 * @param {DragEvent} event The drop event
 * @param {Function} navigate React Router navigate function
 * @param {string} appPrefix App prefix for navigation
 * @param {boolean|null} isOpfsAvailable Whether OPFS is available; `null`
 *   while the startup probe is still running, in which case it is asked here
 * @param {Function} setAlert Function to set alert messages
 * @param {Function} [onSuccess] Optional callback when file is successfully processed
 * @param {Function} [onError] Optional callback when an error occurs
 * @param {{hasCapacity: boolean, record: Function, onExceeded: Function}} [quotaOptions]
 *   Optional quota integration. When provided, blocks the drop if hasCapacity is false
 *   and records the load key via record() on success.
 */
export async function handleFileDrop(event, navigate, appPrefix, isOpfsAvailable, setAlert, onSuccess, onError, quotaOptions) {
  event.preventDefault()
  const files = event.dataTransfer.files

  if (files.length === 0) {
    const message = 'File upload initiated but found no data'
    trackAlert(message)
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }
  if (files.length > 1) {
    const message = 'File upload initiated for more than 1 file'
    trackAlert(message)
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }

  // `null` is the store's "probe not resolved yet" (BaseRoutes sets it at
  // startup), not "unavailable". A drop has no user-activation constraint,
  // so ask directly rather than guess.
  const hasOpfs = isOpfsAvailable === null ? await checkOPFSAvailability() : isOpfsAvailable
  if (!hasOpfs) {
    // AlertDialog counts it (analytics only); see noOpfsLocalFileAlert.
    setAlert(noOpfsLocalFileAlert())
    if (onError) {
      onError(NO_OPFS_LOCAL_FILE_ALERT)
    }
    return
  }

  if (quotaOptions && !quotaOptions.hasCapacity) {
    quotaOptions.onExceeded()
    return
  }

  const dropped = files[0]

  debug().log('handleFileDrop: uploadedFile', dropped)
  // A `.glb.gz` — Share's own compressed export (#1854) — is unwrapped
  // before anything else looks at it, so the type sniffed below, the
  // extension OPFS stores it under and the bytes the loader later parses all
  // describe the model rather than its transport encoding
  // (`loader/gzipEnvelope.js`). Anything that isn't a gzip envelope around a
  // model comes back as-is, `.spz` included.
  let uploadedFile
  try {
    uploadedFile = await inflateIfGzipEnvelope(dropped)
  } catch (e) {
    const message = e.message
    trackAlert(message)
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }
  const type = await guessTypeFromFile(uploadedFile)
  if (type === null) {
    const message = `File upload of unknown type: type(${uploadedFile.type}) size(${uploadedFile.size})`
    // The alert is the user's signal; this is the console's, which had none —
    // a rejected drop left nothing to go on when reported (test-models#69).
    // It names the file, which the alert deliberately does not: the alert's
    // text is also its Sentry grouping key (`trackAlert`), and a per-file
    // name would split that family into one issue per upload. At WARN, the
    // level prod logs at; a bare `debug()` is INFO and prints nothing there.
    debug(WARN).warn(
      `handleFileDrop: "${uploadedFile.name}" (${uploadedFile.size} bytes) is not a recognized model format`)
    trackAlert(message)
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }

  /**
   * @param {string} fileName The OPFS storage id the upload was written
   *   under (`<blob-uuid>.<ext>`) — the `/v/new/` segment the Loader
   *   resolves, distinct from the user's `uploadedFile.name`.
   */
  async function onWritten(fileName) {
    const key = `${appPrefix}/v/new/${fileName}`
    if (quotaOptions) {
      const result = await quotaOptions.record(key)
      if (result && result.allowed === false) {
        quotaOptions.onExceeded()
        return
      }
    }
    disablePageReloadApprovalCheck()
    debug().log('handleFileDrop: navigate to:', fileName)
    navigateToModel(key, navigate)
    addRecentFileEntry({
      id: fileName,
      source: 'local',
      name: uploadedFile.name,
      // Epoch ms, matching RecentFileEntry and RecentFilesList's
      // `Date.now() - utcMs` arithmetic — an ISO string here rendered
      // as "NaNm ago" in the Last-modified column (#1682).
      lastModifiedUtc: uploadedFile.lastModified || null,
      sharePath: key,
    })
    setPendingModelNameUpdate(fileName)
    if (onSuccess) {
      onSuccess(fileName)
    }
  }

  saveDnDFileToOpfs(uploadedFile, type, onWritten)
}


/**
 * Standard drag over/enter handler to enable drop zone
 *
 * @param {DragEvent} event The drag event
 * @param {Function} [setIsDragActive] Optional function to set drag active state
 */
export function handleDragOverOrEnter(event, setIsDragActive) {
  event.preventDefault()
  if (setIsDragActive) {
    setIsDragActive(true)
  }
}


/**
 * Standard drag leave handler to disable drop zone visual feedback
 *
 * @param {DragEvent} event The drag event
 * @param {Function} [setIsDragActive] Optional function to set drag active state
 */
export function handleDragLeave(event, setIsDragActive) {
  event.preventDefault()
  if (setIsDragActive) {
    setIsDragActive(false)
  }
}
