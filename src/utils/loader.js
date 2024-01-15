import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'
import {initializeWorker, opfsReadFile, opfsWriteFile} from '../OPFS/OPFSService.js'


/**
 * Upload a local file for display.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 * @param {Function} handleBeforeUnload
 */
export function loadLocalFile(navigate, appPrefix, handleBeforeUnload, testingSkipAutoRemove = false) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  fileInput.setAttribute('type', 'file')
  const workerRef = initializeWorker()
  fileInput.addEventListener(
      'change',
      (event) => {
        debug().log('loader#loadLocalFile#event:', event)
        const tmpUrl = URL.createObjectURL(event.target.files[0])
        debug().log('loader#loadLocalFile#event: url: ', tmpUrl)
        // Post message to the worker to handle the file
        const parts = tmpUrl.split('/')
        const fileNametmpUrl = parts[parts.length - 1]
        opfsWriteFile(tmpUrl, fileNametmpUrl)

        // Listener for messages from the worker
        workerRef.addEventListener('message', (workerEvent) => {
          if (workerEvent.data.error) {
            debug().error('Error from worker:', workerEvent.data.error)
          } else if (workerEvent.data.completed) {
            if (workerEvent.data.event === 'write') {
              debug().log('Worker finished writing file')

              // Perform the navigation logic after the worker is done
              const fileName = workerEvent.data.fileName
              window.removeEventListener('beforeunload', handleBeforeUnload)
              navigate(`${appPrefix}/v/new/${fileName}.ifc`)
            } else if (workerEvent.data.event === 'read') {
              debug().log('Worker finished reading file')
              const fileName = workerEvent.data.file.name
              window.removeEventListener('beforeunload', handleBeforeUnload)
              navigate(`${appPrefix}/v/new/${fileName}.ifc`)
            }
          }
        })
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
 * Construct browser's actual blob URL from app URL for uploaded file.
 *
 * @param {string} filepath
 * @return {string}
 */
export function getUploadedBlobPath(filepath) {
  const l = window.location
  // TODO(pablo): fix this with the above TODO for ifc suffix.
  filepath = filepath.split('.ifc')[0]
  const parts = filepath.split('/')
  filepath = parts[parts.length - 1]
  filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
  return filepath
}
/**
 * Retrieve file from OPFS.
 *
 * @param {string} filepath
 * @return {string}
 */
export function getFileFromOPFS(filepath) {
  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef !== null) {
      filepath = filepath.split('.ifc')[0]
      const parts = filepath.split('/')
      filepath = parts[parts.length - 1]
      opfsReadFile(filepath)

      // Listener for messages from the worker
      workerRef.addEventListener('message', (event) => {
        if (event.data.error) {
          debug().error('Error from worker:', event.data.error)
          reject(new Error(event.data.error))
        } else if (event.data.completed) {
          debug().log('Worker finished retrieving file')
          const file = event.data.file
          resolve(file) // Resolve the promise with the file
        }
      })
    } else {
      reject(new Error('Worker initialization failed'))
    }
  })
}

