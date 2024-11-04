import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'
import {
  initializeWorker,
  opfsWriteModel,
} from '../OPFS/OPFSService.js'

/**
 * Upload a local file for display.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 * @param {Function} handleBeforeUnload
 */
export function loadLocalFileFallback(navigate, appPrefix, handleBeforeUnload, testingSkipAutoRemove = false) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)
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
        window.removeEventListener('beforeunload', handleBeforeUnload)
        // TODO(pablo): detect content and set appropriate suffix.
        // Alternatively, leave it without suffix, but this also
        // triggers downstream handling issues.
        navigate(`${appPrefix}/v/new/${tmpUrl}.ifc`)
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
 * @param {Function} navigate
 * @param {string} appPrefix
 * @param {Function} handleBeforeUnload
 */
export function loadLocalFileDragAndDropFallback(
    navigate,
    appPrefix,
    handleBeforeUnload,
    file) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)
  let tmpUrl = URL.createObjectURL(file)
  debug().log('loader#loadLocalFileDragAndDrop#event: url: ', tmpUrl)
  const parts = tmpUrl.split('/')
  tmpUrl = parts[parts.length - 1]
  window.removeEventListener('beforeunload', handleBeforeUnload)
  // TODO(pablo): detect content and set appropriate suffix.
  // Alternatively, leave it without suffix, but this also
  // triggers downstream handling issues.
  navigate(`${appPrefix}/v/new/${tmpUrl}.ifc`)
}


/**
 * Upload a local file for display.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 * @param {Function} handleBeforeUnload
 */
export function loadLocalFile(
    navigate,
    appPrefix,
    handleBeforeUnload,
    testingSkipAutoRemove = false,
    testingDisableWebWorker = false) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)
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
                const fileName = workerEvent.data.fileName
                window.removeEventListener('beforeunload', handleBeforeUnload)
                workerRef.removeEventListener('message', listener) // Remove the event listener
                navigate(`${appPrefix}/v/new/${fileName}.ifc`)
              } else if (workerEvent.data.event === 'read') {
                debug().log('Worker finished reading file')
                const fileName = workerEvent.data.file.name
                window.removeEventListener('beforeunload', handleBeforeUnload)
                workerRef.removeEventListener('message', listener) // Remove the event listener
                navigate(`${appPrefix}/v/new/${fileName}.ifc`)
              }
            }
          }
          workerRef.addEventListener('message', listener)

          opfsWriteModel(tmpUrl, event.target.files[0].name, fileNametmpUrl)
        } else {
          window.removeEventListener('beforeunload', handleBeforeUnload)
          navigate(`${appPrefix}/v/new/${fileNametmpUrl}.ifc`)
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
