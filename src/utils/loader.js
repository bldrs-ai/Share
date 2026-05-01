import {
  initializeWorker,
  opfsWriteModel,
} from '../OPFS/OPFSService.js'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'


/**
 * Upload a local file for display.
 *
 * @param {Function} onLoad
 * @param {boolean} testingSkipAutoRemove
 */
export function loadLocalFileFallback(onLoad, testingSkipAutoRemove = false) {
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  fileInput.setAttribute('type', 'file')
  fileInput.addEventListener(
    'change',
    (event) => {
      debug().log('loader#loadLocalFile#event:', event)
      const file = event.target.files[0]
      const lastModifiedUtc = file.lastModified
      const objectUrl = URL.createObjectURL(file)
      debug().log('loader#loadLocalFile#event: url: ', objectUrl)
      const parts = objectUrl.split('/')
      const tmpUrl = parts[parts.length - 1]
      URL.revokeObjectURL(objectUrl)
      if (onLoad) {
        onLoad(tmpUrl, lastModifiedUtc)
      }
    },
    false,
  )
  viewerContainer.appendChild(fileInput)
  fileInput.click()
  if (!testingSkipAutoRemove) {
    viewerContainer.removeChild(fileInput)
  }
}


/**
 * Upload a local file for display.
 *
 * @param {Function} onLoad
 * @param {boolean} testingSkipAutoRemove
 * @param {boolean} testingDisableWebWorker
 */
export function loadLocalFile(onLoad, testingSkipAutoRemove = false, testingDisableWebWorker = false) {
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  fileInput.setAttribute('type', 'file')
  let workerRef = null

  // TODO(nickcastel50): set up proper testing for web workers and OPFS
  if (!testingDisableWebWorker) {
    workerRef = initializeWorker()
  }
  fileInput.addEventListener(
    'change',
    (event) => {
      debug().log('loader#loadLocalFile#event:', event)
      const file = event.target.files[0]
      const lastModifiedUtc = file.lastModified
      const tmpUrl = URL.createObjectURL(file)
      debug().log('loader#loadLocalFile#event: url: ', tmpUrl)
      // Post message to the worker to handle the file
      const parts = tmpUrl.split('/')
      const fileNametmpUrl = parts[parts.length - 1]
      if (!testingDisableWebWorker) {
        // Listener for messages from the worker.  We can't revoke
        // tmpUrl until the worker is done with it, so revoke when the
        // listener detaches (success or error path).
        const listener = (workerEvent) => {
          if (workerEvent.data.error) {
            debug().error('Error from worker:', workerEvent.data.error)
            workerRef.removeEventListener('message', listener)
            URL.revokeObjectURL(tmpUrl)
          } else if (workerEvent.data.completed) {
            if (workerEvent.data.event === 'write') {
              debug().log('Worker finished writing file')
              workerRef.removeEventListener('message', listener)
              URL.revokeObjectURL(tmpUrl)
              onLoad(workerEvent.data.fileName, lastModifiedUtc)
            } else if (workerEvent.data.event === 'read') {
              debug().log('Worker finished reading file')
              workerRef.removeEventListener('message', listener)
              URL.revokeObjectURL(tmpUrl)
              onLoad(workerEvent.data.file.name, lastModifiedUtc)
            }
          }
        }
        workerRef.addEventListener('message', listener)
        const filename = file.name
        const dotParts = filename.split('.')
        if (dotParts.length <= 1) {
          throw new Error('Cannot extract filetype from filename')
        }
        const ext = dotParts[dotParts.length - 1]
        opfsWriteModel(tmpUrl, filename, `${fileNametmpUrl}.${ext}`)
      } else {
        URL.revokeObjectURL(tmpUrl)
        onLoad(fileNametmpUrl, lastModifiedUtc)
      }
    },
    false,
  )

  viewerContainer.appendChild(fileInput)
  fileInput.click()
  if (!testingSkipAutoRemove) {
    viewerContainer.removeChild(fileInput)
  }
}


/**
 * Upload a local file for display from Drag And Drop.
 *
 * @param {File} file
 * @param {Function} callback Not optional since all known flows require it.
 */
export function saveDnDFileToOpfsFallback(file, callback) {
  assertDefined(file, callback)
  const objectUrl = URL.createObjectURL(file)
  debug().log('utils/loader#saveDnDFileToOpfsAndNavFallback: url: ', objectUrl)
  const parts = objectUrl.split('/')
  const tmpUrl = parts[parts.length - 1]
  URL.revokeObjectURL(objectUrl)
  callback(tmpUrl)
}
