import {
  initializeWorker,
  opfsDownloadToOPFS,
  opfsDownloadModel,
  opfsReadModel,
  opfsWriteModel,
  opfsWriteModelFileHandle,
  opfsDoesFileExist,
  opfsDeleteModel,
  opfsSnapshotCache,
  opfsClearCache,
  opfsWriteBase64Model,
} from '../OPFS/OPFSService.js'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'


/**
 * Write model to OPFS.
 *
 * @param {string} filepath
 * @return {Promise<File>}
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
 * @return {Promise<File>}
 */
export function downloadToOPFS(
  objectUrl,
  originalFilePath,
  commitHash,
  owner,
  repo,
  branch,
  onProgress) {
  assertDefined(
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
 * Downloads a model, handles progress updates, and updates the OPFS file handle.
 *
 * @param {string} content The base 64 content of the object to be downloaded.
 * @param {string} shaHash TODO(pablo): give a reference for how we use these.
 * @param {string} originalFilePath The original file path of the model.
 * @param {string} accessToken Access token for authentication.
 * @param {string} owner The owner of the repository.
 * @param {string} repo The repository name.
 * @param {string} branch The branch name.
 * @param {Function} setOpfsFile Function to set the OPFS file in the state.
 * @param {Function} onProgress Optional function to handle progress events.
 * @return {Promise<File>} - A promise that resolves to the downloaded file.
 */
export function writeBase64Model(
  content,
  shaHash,
  originalFilePath,
  accessToken,
  owner,
  repo,
  branch,
  setOpfsFile) {
  assertDefined(content, shaHash, originalFilePath, accessToken, owner, repo, branch, setOpfsFile)
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
          if (event.data.event === 'download') {
            debug().warn('Worker finished downloading file')
          } else if (event.data.event === 'exists') {
            debug().warn('Commit exists in OPFS.')
          }
          const file = event.data.file
          if (event.data.event === 'renamed' || event.data.event === 'exists') {
            workerRef.removeEventListener('message', listener) // Remove the event listener
            if (file instanceof File) {
              setOpfsFile(file)
            } else {
              debug().error('Retrieved object is not of type File.')
            }
          }
          resolve(file) // Resolve the promise with the file
        }
      }
      workerRef.addEventListener('message', listener)
    } else {
      reject(new Error('Worker initialization failed'))
    }
    opfsWriteBase64Model(content, shaHash, originalFilePath, owner, repo, branch, accessToken)
  })
}

/**
 * Downloads a model, handles progress updates, and updates the OPFS file handle.
 *
 * @param {string} objectUrl The URL of the object to be downloaded.
 * @param {string} shaHash TODO(pablo): give a reference for how we use these.
 * @param {string} originalFilePath The original file path of the model.
 * @param {string} accessToken Access token for authentication.
 * @param {string} owner The owner of the repository.
 * @param {string} repo The repository name.
 * @param {string} branch The branch name.
 * @param {Function} setOpfsFile Function to set the OPFS file in the state.
 * @param {Function} onProgress Optional function to handle progress events.
 * @return {Promise<File>} - A promise that resolves to the downloaded file.
 */
export function downloadModel(
  objectUrl,
  shaHash,
  originalFilePath,
  accessToken,
  owner,
  repo,
  branch,
  setOpfsFile,
  onProgress) {
  assertDefined(objectUrl, shaHash, originalFilePath, accessToken, owner, repo, branch, setOpfsFile, onProgress)
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
          if (event.data.event === 'renamed' || event.data.event === 'exists') {
            workerRef.removeEventListener('message', listener) // Remove the event listener
            if (file instanceof File) {
              setOpfsFile(file)
            } else {
              debug().error('Retrieved object is not of type File.')
            }
          }
          resolve(file) // Resolve the promise with the file
        }
      }
      workerRef.addEventListener('message', listener)
    } else {
      reject(new Error('Worker initialization failed'))
    }
    opfsDownloadModel(objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, !!(onProgress))
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
            if (event.data.event === 'clear') {
              console.warn('OPFS cache cleared.')
            }
            if (event.data.directoryStructure) {
              console.warn(`OPFS Directory Structure:\n${ event.data.directoryStructure}`)
            }
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
 * @return {Promise<boolean>}
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
 * Prints a snapshot of the OPFS directory structure
 *
 * @return {Promise<boolean>}
 */
export function snapshotOPFS(previewWindow = 0) {
  // Wrap opfsSnapshotCache so makePromise still receives a callback with standard signature
  const callback = () => opfsSnapshotCache(previewWindow)
  return makePromise(callback, null, null, null, null, null, 'snapshot')
}

/**
 * Deletes entirety of OPFS cache
 *
 * @return {boolean}
 */
export function clearOPFSCache() {
  return makePromise(opfsClearCache, null, null, null, null, null, 'clear')
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
 * @return {Promise<boolean>}
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
 * Upload a local file for display from Drag And Drop, storing in OPFS and
 * invoke given callback, e.g. for navigation change.
 *
 * @param {File} file
 * @param {string} type As defined in Filetype.
 * @param {Function} callback Not optional since all known flows require it.
 */
export function saveDnDFileToOpfs(file, type, callback) {
  assertDefined(file, type, callback)
  let workerRef = null
  workerRef = initializeWorker()

  const tmpUrl = URL.createObjectURL(file)
  debug().log('OPFS/utils#saveDnDFileToOpfs: event: url: ', tmpUrl)
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
        workerRef.removeEventListener('message', listener)
        callback(fileName)
      } else if (workerEvent.data.event === 'read') {
        debug().log('Worker finished reading file')
        const fileName = workerEvent.data.file.name
        workerRef.removeEventListener('message', listener) // Remove the event listener
        callback(fileName)
      }
    }
  }

  workerRef.addEventListener('message', listener)

  const originalFilename = file.name
  const filename = `${fileNametmpUrl}.${type}`
  debug().log('OPFS/utils#saveDnDFileToOpfs: calling opfsWriteModel with typed filename:', filename)
  opfsWriteModel(tmpUrl, originalFilename, filename)
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

/**
 *
 */
export function setUpGlobalDebugFunctions() {
  window.snapshotOPFS = snapshotOPFS
  window.clearOPFSCache = clearOPFSCache
}
