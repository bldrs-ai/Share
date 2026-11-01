import {guessTypeFromFile} from '../Filetype'
import {checkOPFSAvailability, saveDnDFileToOpfs} from '../OPFS/utils'
import {addRecentFileEntry, setPendingModelNameUpdate} from '../connections/persistence'
import {inflateIfGzipEnvelope} from '../loader/gzipEnvelope'
import {forgetInMemoryUpload, registerInMemoryUpload} from '../loader/inMemoryUploads'
import {unrecognizedFormatAlert} from '../loader/unrecognizedFormat'
import {localOnlyPath} from '../routes/localOnly'
import {disablePageReloadApprovalCheck} from './event'
import {navigateToInMemoryModel, navigateToModel} from './navigate'
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
 * @param {{record: Function, onExceeded: Function}} [quotaOptions]
 *   Optional quota integration: records the load key via record() once the
 *   file is stored, and calls onExceeded instead of navigating if refused.
 *   There is deliberately no capacity check before the drop is read: local
 *   files are free and unmetered (Share#1966), so record() passes their key,
 *   and a pre-gate on the user's private-model count would refuse a local
 *   file for being at a limit that doesn't apply to it. With
 *   `meterLocalFiles` switched on, record() is still the gate; the file is
 *   stored first, as for an allowed drop, and left in OPFS on a refusal.
 */
export async function handleFileDrop(event, navigate, appPrefix, isOpfsAvailable, setAlert, onSuccess, onError, quotaOptions) {
  event.preventDefault()
  const files = event.dataTransfer.files

  // None of the alerts below is reported to Sentry from here. Each goes to
  // setAlert, and AlertDialog's effect is the one place an alert is
  // captured; this function used to call trackAlert too, so every rejected
  // drop landed in Sentry twice in the same second (one event from this
  // stack, one from AlertDialog's) and the drop families' counts read double.

  if (files.length === 0) {
    const message = 'File upload initiated but found no data'
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }
  if (files.length > 1) {
    const message = 'File upload initiated for more than 1 file'
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }

  // `null` is the store's "probe not resolved yet" (BaseRoutes sets it at
  // startup), not "unavailable". A drop has no user-activation constraint,
  // so ask directly rather than guess. Without OPFS the file is held in
  // memory instead (#1906, `onHeldInMemory` below).
  const hasOpfs = isOpfsAvailable === null ? await checkOPFSAvailability() : isOpfsAvailable

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
    // It names the file, which the alert deliberately does not: the alert
    // keeps only the extension (`loader/unrecognizedFormat.js`), so the name
    // stays out of the Sentry event's title, grouping and tags, and out of GA.
    // It does still reach Sentry through this line: the default breadcrumbs
    // integration records console output, so the event AlertDialog captures
    // carries it as a console breadcrumb. At WARN, the level prod logs at; a
    // bare `debug()` is INFO and prints nothing there.
    debug(WARN).warn(
      `handleFileDrop: "${uploadedFile.name}" (${uploadedFile.size} bytes) is not a recognized model format`)
    setAlert(unrecognizedFormatAlert(message, uploadedFile.name, 'drop'))
    if (onError) {
      onError(message)
    }
    return
  }

  /**
   * @param {string} fileName The OPFS storage id the upload was written
   *   under (`<blob-uuid>.<ext>`) — the `/v/local-only/` segment the Loader
   *   resolves, distinct from the user's `uploadedFile.name`.
   */
  async function onWritten(fileName) {
    const key = localOnlyPath(appPrefix, fileName)
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

  /**
   * The no-OPFS path: hold the file in this page's memory and navigate
   * in-app, since a page load would drop it (`loader/inMemoryUploads.js`).
   * No local recent: nothing is stored to reopen it from.
   *
   * @param {string} storageId `<uuid>.<ext>`, the in-memory id
   */
  async function onHeldInMemory(storageId) {
    const key = localOnlyPath(appPrefix, storageId)
    if (quotaOptions) {
      const result = await quotaOptions.record(key)
      if (result && result.allowed === false) {
        // Registered before the quota could answer (the key names the id),
        // so drop it: nothing else would (codex review on #1957).
        forgetInMemoryUpload(storageId)
        quotaOptions.onExceeded()
        return
      }
    }
    debug().log('handleFileDrop: navigate in-app to in-memory upload:', storageId)
    navigateToInMemoryModel(key, navigate)
    if (onSuccess) {
      onSuccess(storageId)
    }
  }

  if (hasOpfs) {
    saveDnDFileToOpfs(uploadedFile, type, onWritten)
  } else {
    await onHeldInMemory(registerInMemoryUpload(uploadedFile, type))
  }
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
