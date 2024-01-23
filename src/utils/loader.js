import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'
import {initializeWorker, opfsWriteModel, opfsReadModel, opfsDownloadToOPFS} from '../OPFS/OPFSService.js'

/**
 * Upload a local file for display from Drag And Drop.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 * @param {Function} handleBeforeUnload
 */
export function loadLocalFileDragAndDrop(
    navigate,
    appPrefix,
    handleBeforeUnload,
    file,
    testingDisableWebWorker = false) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)
  let workerRef = null
  if (!testingDisableWebWorker) {
    workerRef = initializeWorker()
  }

  debug().log('loader#loadLocalFileDragAndDrop#event:', event)
  const tmpUrl = URL.createObjectURL(file)
  debug().log('loader#loadLocalFileDragAndDrop#event: url: ', tmpUrl)
  // Post message to the worker to handle the file
  const parts = tmpUrl.split('/')
  const fileNametmpUrl = parts[parts.length - 1]

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

  const commitHash = ''
  opfsWriteModel(tmpUrl, fileNametmpUrl, file.name, commitHash)
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
          const commitHash = ''
          opfsWriteModel(tmpUrl, fileNametmpUrl, event.target.files[0].name, commitHash)
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
 * Retrieve model from OPFS.
 *
 * @param {string} filepath
 * @return {File}
 */
export function getModelFromOPFS(filepath) {
  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef !== null) {
      filepath = filepath.split('.ifc')[0]
      const parts = filepath.split('/')
      filepath = parts[parts.length - 1]
      opfsReadModel(filepath)

      // Listener for messages from the worker
      const listener = (event) => {
        if (event.data.error) {
          debug().error('Error from worker:', event.data.error)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          reject(new Error(event.data.error))
        } else if (event.data.completed) {
          debug().log('Worker finished retrieving file')
          const file = event.data.file
          debug().log(`Metadata: ${event.data.metaDataString}`)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          resolve(file) // Resolve the promise with the file
        }
      }

      workerRef.addEventListener('message', listener)
    } else {
      reject(new Error('Worker initialization failed'))
    }
  })
}


/**
 * Download model to OPFS if it doesn't already exist
 * with a matching commit hash.
 *
 * @param {string} filepath
 * @param {string} commitHash
 * @return {boolean}
 */
export function downloadToOPFS(
    navigate,
    appPrefix,
    handleBeforeUnload,
    objectUrl,
    originalFilePath,
    commitHash,
    onProgress) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)

  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef !== null) {
      // Listener for messages from the worker
      const listener = (event) => {
        if (event.data.error) {
          debug().error('Error from worker:', event.data.error)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          reject(new Error(event.data.error))
        } else if (event.data.progressEvent) {
          if (onProgress) {
            onProgress({
              lengthComputable: event.data.contentLength !== 0,
              contentLength: event.data.contentLength,
              receivedLength: event.data.receivedLength,
            }) // Custom progress event
          }
        } else if (event.data.completed) {
          if (event.data.event === 'download') {
            debug().warn('Worker finished downloading file')
            debug().warn(`Metadata: ${event.data.metaDataString}`)
          } else if (event.data.event === 'exists') {
            debug().warn('Commit exists in OPFS, redirecting to local project.')
          }
          const fileName = event.data.fileName
          window.removeEventListener('beforeunload', handleBeforeUnload)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          navigate(`${appPrefix}/v/new/${fileName}.ifc`)
          resolve(true) // Resolve the promise with the file
        }
      }
      workerRef.addEventListener('message', listener)
    } else {
      reject(new Error('Worker initialization failed'))
    }


    opfsDownloadToOPFS(objectUrl, commitHash, originalFilePath, !!(onProgress))
  })

  /* // Combine chunks into single Uint8Array
  let chunksAll = new Uint8Array(receivedLength);
  let position = 0;
  for (let chunk of chunks) {
    chunksAll.set(chunk, position);
    position += chunk.length;
  }

  // Create a blob from the chunks
  const fileBuffer = new Blob([chunksAll]);

  return fileBuffer*/
}

