import {
  initializeWorker,
  opfsDownloadToOPFS,
  opfsReadModel,
  opfsWriteModel,
  opfsWriteModelFileHandle,
  opfsDoesFileExist,
  opfsDeleteModel,
} from '../OPFS/OPFSService.js'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'


/**
 * Retrieve model from OPFS.
 *
 * @param {string} filepath
 * @return {File}
 */
export function writeSavedGithubModelOPFS(modelFile, originalFilePath, commitHash, owner, repo, branch) {
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
      opfsWriteModelFileHandle(modelFile, originalFilePath, commitHash, owner, repo, branch)
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
  assertDefined(
      navigate,
      appPrefix,
      handleBeforeUnload,
      objectUrl,
      originalFilePath,
      commitHash,
      owner,
      repo,
      branch)

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
              total: event.data.total,
              loaded: event.data.loaded,
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
 * Executes an asynchronous task using a Web Worker and returns a promise that resolves based on the task's outcome.
 * This function initializes a worker, sets up a message listener for the worker's response, and performs cleanup
 * after receiving a response. It abstracts the worker communication logic, making it easier to perform file-related
 * operations asynchronously.
 *
 * @param {Function} callback The function to call that initiates the worker task. This function should
 *     trigger an operation in the worker by sending it a message. The parameters
 *     for this callback include the file path, commit hash, owner, repository, and branch.
 * @param {string} originalFilePath The path of the file on which the operation is performed
 * @param {string} commitHash The commit hash associated with the operation, used for version control
 * @param {string} owner The identifier for the owner of the repository
 * @param {string} repo The name of the repository where the file operation is related
 * @param {string} branch The branch within the repository on which the operation is performed
 * @param {string} eventStatus The specific event status the function waits for to resolve the promise
 *     This parameter allows the function to be used for various operations
 *     by specifying the expected success event type from the worker (e.g., 'deleted', 'written')
 * @return {Promise<boolean>} A promise that resolves to true if the worker completes the operation successfully
 *     and matches the `eventStatus`. If the worker encounters an error or if the event
 *     indicates that the file does not exist, the promise will reject with an error or
 *     resolve to false, respectively.
 */
function makePromise(callback, originalFilePath, commitHash, owner, repo, branch, eventStatus) {
  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef !== null) {
      // Listener for messages from the worker
      const listener = (event) => {
        if (event.data.error) {
          debug().error('Error from worker:', event.data.error)
          workerRef.removeEventListener('message', listener) // Remove the event listener
          reject(new Error(event.data.error))
        } else if (event.data.completed) {
          if (event.data.event === 'notexist') {
            workerRef.removeEventListener('message', listener) // Remove the event listener
            resolve(false) // Resolve the promise with false
          } else if (event.data.event === eventStatus) {
            workerRef.removeEventListener('message', listener) // Remove the event listener
            resolve(true) // Resolve the promise with true
          }
        }
      }
      workerRef.addEventListener('message', listener)
    } else {
      reject(new Error('Worker initialization failed'))
    }

    callback(originalFilePath, commitHash, owner, repo, branch)
  })
}

/**
 * Checks to see if a file exists in OPFS.
 *
 * @param {string} originalFilePath
 * @param {string} commitHash
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @return {boolean}
 */
export function doesFileExistInOPFS(
    originalFilePath,
    commitHash,
    owner,
    repo,
    branch) {
  assertDefined(originalFilePath, commitHash, owner, repo, branch)

  return makePromise(opfsDoesFileExist, originalFilePath, commitHash, owner, repo, branch, 'exist')
}

/**
 * Deletes a file from opfs if it exists.
 * Returns true if file was found and deleted, false otherwise.
 *
 * @param {string} originalFilePath
 * @param {string} commitHash
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @return {boolean}
 */
export function deleteFileFromOPFS(
    originalFilePath,
    commitHash,
    owner,
    repo,
    branch) {
  assertDefined(originalFilePath, commitHash, owner, repo, branch)

  return makePromise(opfsDeleteModel, originalFilePath, commitHash, owner, repo, branch, 'deleted')
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
 * // TODO: [https://bugs.webkit.org/show_bug.cgi?id=251460].
 * And we should also enumerate what methods we use and check
 * they all exist, since opfs is marked as partial on many browsers
 *
 * @return {boolean}
 */
export async function checkOPFSAvailability() {
  if ('FileSystemDirectoryHandle' in window) {
    try {
      await navigator.storage.getDirectory()
      return true
    } catch (error) {
      // Expected for Non chromium browsers (Safari, FF, etc) in private browsing mode
      debug().error(`OPFS error: ${ error}`)
      return false
    }
  } else {
    return false
  }
}
