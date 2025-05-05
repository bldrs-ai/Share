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
 */
export function loadLocalFileFallback(onLoad, testingSkipAutoRemove = false) {
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  fileInput.setAttribute('type', 'file')
  fileInput.addEventListener(
    'change',
    (event) => {
      debug().log('loader#loadLocalFile#event:', event)
      let tmpUrl = URL.createObjectURL(event.target.files[0])
      debug().log('loader#loadLocalFile#event: url: ', tmpUrl)
      const parts = tmpUrl.split('/')
      tmpUrl = parts[parts.length - 1]
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
        const tmpUrl = URL.createObjectURL(event.target.files[0])
        debug().log('loader#loadLocalFile#event: url: ', tmpUrl)
        // Post message to the worker to handle the file
        const parts = tmpUrl.split('/')
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
          opfsWriteModel(tmpUrl, filename, `${fileNametmpUrl}.${ext}`)
        } else {
          onLoad(fileNametmpUrl)
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
  let tmpUrl = URL.createObjectURL(file)
  debug().log('utils/loader#saveDnDFileToOpfsAndNavFallback: url: ', tmpUrl)
  const parts = tmpUrl.split('/')
  tmpUrl = parts[parts.length - 1]
  callback(tmpUrl)
}
