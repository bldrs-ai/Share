import {guessTypeFromFile} from '../Filetype'
import {saveDnDFileToOpfs} from '../OPFS/utils'
import {canLoadModel, recordModelLoad} from '../privacy/usageTracking'
import {disablePageReloadApprovalCheck} from './event'
import {trackAlert} from './alertTracking'
import {navigateToModel} from './navigate'
import {saveDnDFileToOpfsFallback} from './loader'
import debug from './debug'


/**
 * Handles drag and drop file upload with validation and processing
 *
 * @param {DragEvent} event The drop event
 * @param {Function} navigate React Router navigate function
 * @param {string} appPrefix App prefix for navigation
 * @param {boolean} isOpfsAvailable Whether OPFS is available
 * @param {Function} setAlert Function to set alert messages
 * @param {Function} [onSuccess] Optional callback when file is successfully processed
 * @param {Function} [onError] Optional callback when an error occurs
 * @param {string} [userTier] User tier for rate limiting ('anonymous'|'free'|'pro')
 * @param {Function} [onLimitReached] Callback when rate limit is exceeded, receives {reason, stats}
 */
export async function handleFileDrop(event, navigate, appPrefix, isOpfsAvailable, setAlert, onSuccess, onError, userTier, onLimitReached) {
  event.preventDefault()

  // Rate-limit check for file drops (always user-initiated, never sample models)
  if (userTier && userTier !== 'pro') {
    const check = canLoadModel(userTier)
    if (!check.allowed) {
      if (onLimitReached) {
        onLimitReached({reason: check.reason, stats: check.stats})
      }
      return
    }
  }

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
  const uploadedFile = files[0]

  debug().log('handleFileDrop: uploadedFile', uploadedFile)
  const type = await guessTypeFromFile(uploadedFile)
  if (type === null) {
    const message = `File upload of unknown type: type(${uploadedFile.type}) size(${uploadedFile.size})`
    trackAlert(message)
    setAlert(message)
    if (onError) {
      onError(message)
    }
    return
  }

  /** @param {string} fileName The filename the upload was given */
  function onWritten(fileName) {
    recordModelLoad()
    disablePageReloadApprovalCheck()
    debug().log('handleFileDrop: navigate to:', fileName)
    navigateToModel(`${appPrefix}/v/new/${fileName}`, navigate)
    if (onSuccess) {
      onSuccess(fileName)
    }
  }

  if (isOpfsAvailable) {
    saveDnDFileToOpfs(uploadedFile, type, onWritten)
  } else {
    saveDnDFileToOpfsFallback(uploadedFile, onWritten)
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
