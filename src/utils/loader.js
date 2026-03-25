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
      const objectUrl = URL.createObjectURL(event.target.files[0])
      debug().log('loader#loadLocalFile#event: url: ', objectUrl)
      const parts = objectUrl.split('/')
      const tmpUrl = parts[parts.length - 1]
      URL.revokeObjectURL(objectUrl)
      if (onLoad) {
        onLoad(tmpUrl)
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
      const objectUrl = URL.createObjectURL(event.target.files[0])
      debug().log('loader#loadLocalFile#event: url: ', objectUrl)
      // Post message to the worker to handle the file
      const parts = objectUrl.split('/')
      const fileNametmpUrl = parts[parts.length - 1]
      if (!testingDisableWebWorker) {
        // Listener for messages from the worker
        const listener = (workerEvent) => {
          if (workerEvent.data.error) {
            debug().error('Error from worker:', workerEvent.data.error)
            workerRef.removeEventListener('message', listener) // Remove the event listener
          } else if (workerEvent.data.completed) {
            if (workerEvent.data.event === 'write') {
              debug().log('Worker finished writing file')
              // Perform the navigation logic after the worker is done
              onLoad(workerEvent.data.fileName)
            } else if (workerEvent.data.event === 'read') {
              debug().log('Worker finished reading file')
              onLoad(workerEvent.data.file.name)
            }
          }
        }
        workerRef.addEventListener('message', listener)
        const filename = event.target.files[0].name
        const dotParts = filename.split('.')
        if (dotParts.length <= 1) {
          throw new Error('Cannot extract filetype from filename')
        }
        const ext = dotParts[dotParts.length - 1]
        opfsWriteModel(objectUrl, filename, `${fileNametmpUrl}.${ext}`)
      } else {
        onLoad(fileNametmpUrl)
      }
      URL.revokeObjectURL(objectUrl)
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
