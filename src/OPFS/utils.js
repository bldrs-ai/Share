import {
  initializeWorker,
  opfsDownloadToOPFS,
  opfsReadModel,
  opfsWriteModel,
  opfsWriteModelFileHandle,
} from '../OPFS/OPFSService.js'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'


/**
 * Retrieve model from OPFS.
 *
 * @param {string} filepath
 * @return {File}
 */
export function writeSavedGithubModelOPFS(modelFile, originalFileName, commitHash, owner, repo, branch) {
  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef !== null) {
      // Listener for messages from the worker
      const listener = (workerEvent) => {
        if (workerEvent.data.error) {
          debug().error('Error from worker:', workerEvent.data.error)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          resolve(false)
        } else if (workerEvent.data.completed) {
          if (workerEvent.data.event === 'write') {
            debug().log('Worker finished writing file')
            workerRef.removeEventListener('message', listener) // Remove the event listener
            resolve(true)
          }
        }
      }
      workerRef.addEventListener('message', listener)
      opfsWriteModelFileHandle(modelFile, originalFileName, commitHash, owner, repo, branch)
    } else {
      reject(new Error('Worker initialization failed'))
    }
  })
}


/**
 * Retrieve model from OPFS.
 *
 * @param {string} filepath
 * @return {File}
 */
export function getModelFromOPFS(owner, repo, branch, filepath) {
  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef !== null) {
      filepath = filepath.split('.ifc')[0]
      const parts = filepath.split('/')
      filepath = parts[parts.length - 1]

      // Listener for messages from the worker
      const listener = (event) => {
        if (event.data.error) {
          debug().error('Error from worker:', event.data.error)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          reject(new Error(event.data.error))
        } else if (event.data.completed) {
          debug().log('Worker finished retrieving file')
          const file = event.data.file
          workerRef.removeEventListener('message', listener) // Remove the event listener
          resolve(file) // Resolve the promise with the file
        }
      }

      workerRef.addEventListener('message', listener)
      opfsReadModel(filepath)
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
 * @return {File}
 */
export function downloadToOPFS(
    navigate,
    appPrefix,
    handleBeforeUnload,
    objectUrl,
    originalFilePath,
    commitHash,
    owner,
    repo,
    branch,
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
          } else if (event.data.event === 'exists') {
            debug().warn('Commit exists in OPFS.')
          }
          const file = event.data.file
          workerRef.removeEventListener('message', listener) // Remove the event listener
          resolve(file) // Resolve the promise with the file
        }
      }
      workerRef.addEventListener('message', listener)
    } else {
      reject(new Error('Worker initialization failed'))
    }

    opfsDownloadToOPFS(objectUrl, commitHash, originalFilePath, owner, repo, branch, !!(onProgress))
  })
}


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
    file) {
  assertDefined(navigate, appPrefix, handleBeforeUnload)
  let workerRef = null
  workerRef = initializeWorker()

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

  opfsWriteModel(tmpUrl, file.name, fileNametmpUrl)
}

/**
 * Checks if OPFS is available on the browser
 * // HACK: Issue might be with a specific function, look later
 *
 * @return {boolean}
 */
export function checkOPFSAvailability() {
  // Check for FileSystemDirectoryHandle availability
  if ('FileSystemDirectoryHandle' in window) {
    return true
  } else {
    return false
  }
}
