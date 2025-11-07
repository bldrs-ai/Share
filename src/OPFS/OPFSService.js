import debug from '../utils/debug'
import {GITHUB_BASE_URL_AUTHED, GITHUB_BASE_URL_UNAUTHED} from '../net/github/OctokitExport'

// TODO(pablo): probably don't need global state, can
// pass worker refs as needed.
let workerRef = null

/**
 * Initializes and returns a reference to a web worker.
 *
 * Checks if a web worker reference already exists; if not, it creates a new web worker
 * instance using the specified script path. This ensures that only one instance of the
 * worker is created and reused across the application, optimizing resource usage.
 * Uses ESM module worker with {type: 'module'}.
 *
 * @return {Worker} The reference to the initialized web worker.
 */
export function initializeWorker() {
  if (workerRef === null) {
    workerRef = new Worker(new URL('/OPFS.Worker.js', import.meta.url), {type: 'module'})

    workerRef.postMessage({
      command: 'initializeWorker',
      GITHUB_BASE_URL_AUTHED: GITHUB_BASE_URL_AUTHED,
      GITHUB_BASE_URL_UNAUTHED: GITHUB_BASE_URL_UNAUTHED,
    })
  }

  return workerRef
}


/**
 * Terminates the web worker and resets its reference.
 *
 * If a web worker reference exists, this function terminates the worker
 * to stop its execution and free up any system resources it might be using.
 * After termination, the worker reference is set to null, effectively
 * resetting the state to allow for a new worker to be initialized if needed.
 */
export function terminateWorker() {
  if (workerRef) {
    workerRef.terminate()
    workerRef = null
  }
}

/**
 * Writes the content from a specified URL to a file in the OPFS.
 *
 * Sends a command to the worker to write data from an object URL to a specified file name.
 * This operation requires the worker to be initialized; if not, an error is logged.
 * It is useful for operations like saving web content directly to the OPFS without
 * downloading it to the user's device first.
 *
 * @param {string} objectUrl - The URL of the object to be written to the file.
 * @param {string} fileName - The name of the file where the object's content will be written.
 */
export function opfsWriteFile(objectUrl, fileName) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'writeObjectURLToFile',
    objectUrl: objectUrl,
    fileName: fileName,
  })
}

/**
 * Writes a model to the OPFS based on a specified URL and metadata.
 *
 * This function sends a command to a worker to write a model to the OPFS.
 * It requires the worker to be initialized; if the worker is not available, an error is logged.
 * The function is designed to save model data from a given URL under a specific commit hash
 * and original file name, facilitating version control and organization of model files.
 *
 * @param {string} objectUrl The URL from which the model data is to be written
 * @param {string} originalFileName The original file name for the model in the repository
 * @param {string} commitHash The commit hash associated with the model data
 */
export function opfsWriteModel(objectUrl, originalFileName, commitHash) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'writeObjectModel',
    objectUrl: objectUrl,
    objectKey: commitHash,
    originalFileName: originalFileName,
  })
}

/**
 * Deletes a model from the OPFS repository.
 *
 * This function sends a message to a worker to delete a model
 * based on its commit hash and original file path within a specific
 * owner's repository and branch.
 *
 * @param {string} originalFileName The original name of the file to delete
 * @param {string} commitHash The commit hash associated with the model to delete
 * @param {string} owner The owner of the repository
 * @param {string} repo The name of the repository
 * @param {string} branch The branch name where the file resides
 */
export function opfsDeleteModel(originalFileName, commitHash, owner, repo, branch) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'deleteModel',
    commitHash: commitHash,
    originalFilePath: originalFileName,
    owner: owner,
    repo: repo,
    branch: branch,
  })
}

/**
 * Checks if a file exists in the OPFS repository.
 *
 * This function sends a message to a worker to check if a file exists
 * based on its commit hash and original file path within a specific
 * owner's repository and branch.
 *
 * @param {string} originalFileName The name of the file to check for existence
 * @param {string} commitHash The commit hash associated with the file
 * @param {string} owner The owner of the repository
 * @param {string} repo The name of the repository
 * @param {string} branch The branch name where the file might reside
 */
export function opfsDoesFileExist(originalFileName, commitHash, owner, repo, branch) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'doesFileExist',
    commitHash: commitHash,
    originalFilePath: originalFileName,
    owner: owner,
    repo: repo,
    branch: branch,
  })
}

/**
 * Writes a model file to the OPFS repository.
 *
 * This function sends a message to a worker to write a model file
 * based on its commit hash, original file name, and other repository
 * details. It is used to handle the process of writing or updating
 * model files within a specific owner's repository and branch.
 *
 * @param {File} file The file to be written to the repository
 * @param {string} originalFilePath The original name of the file being written
 * @param {string} commitHash The commit hash associated with the file write operation
 * @param {string} owner The owner of the repository where the file is to be written
 * @param {string} repo The name of the repository
 * @param {string} branch The branch name where the file will be written
 */
export function opfsWriteModelFileHandle(file, originalFilePath, commitHash, owner, repo, branch) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({
    command: 'writeObjectModelFileHandle',
    file: file,
    objectKey: commitHash,
    originalFilePath: originalFilePath,
    owner: owner,
    repo: repo,
    branch: branch,
  })
}

/**
 * Downloads a file to the OPFS repository from a specified URL.
 *
 * Initiates a download process for a file from the provided URL to
 * store it within the OPFS repository under a specific commit hash,
 * original file path, and within the specified owner's repository and branch.
 * The function also supports progress tracking through a callback function.
 *
 * @param {string} objectUrl The URL from which the file is to be downloaded
 * @param {string} commitHash The commit hash associated with the download operation
 * @param {string} originalFilePath The path where the file will be stored in the repository
 * @param {string} owner The owner of the repository
 * @param {string} repo The name of the repository
 * @param {string} branch The branch name where the file will be stored
 * @param {Function} onProgress A callback function to track the progress of the download
 */
export function opfsDownloadToOPFS(objectUrl, commitHash, originalFilePath, owner, repo, branch, onProgress) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'downloadToOPFS',
    objectUrl: objectUrl,
    commitHash: commitHash,
    originalFilePath: originalFilePath,
    owner: owner,
    repo: repo,
    branch: branch,
    onProgress: onProgress,
  })
}

/**
 * Downloads a file to the OPFS repository from a specified URL.
 *
 * Initiates a download process for a file from the provided URL to
 * store it within the OPFS repository under a specific commit hash,
 * original file path, and within the specified owner's repository and branch.
 * The function also supports progress tracking through a callback function.
 *
 * @param {string} objectUrl The URL from which the file is to be downloaded
 * @param {string} shaHash The file hash for the object
 * @param {string} originalFilePath The path where the file will be stored in the repository
 * @param {string} owner The owner of the repository
 * @param {string} repo The name of the repository
 * @param {string} branch The branch name where the file will be stored
 * @param {string} accessToken GitHub access token
 * @param {Function} onProgress A callback function to track the progress of the download
 */
export function opfsDownloadModel(objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, onProgress) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'downloadModel',
    objectUrl: objectUrl,
    shaHash: shaHash,
    originalFilePath: originalFilePath,
    owner: owner,
    repo: repo,
    branch: branch,
    accessToken: accessToken,
    onProgress: onProgress,
  })
}

/**
 * Downloads a file to the OPFS repository from a specified URL.
 *
 * Initiates a download process for a file from the provided URL to
 * store it within the OPFS repository under a specific commit hash,
 * original file path, and within the specified owner's repository and branch.
 * The function also supports progress tracking through a callback function.
 *
 * @param {string} content The base 64 content for the model
 * @param {string} shaHash The file hash for the object
 * @param {string} originalFilePath The path where the file will be stored in the repository
 * @param {string} owner The owner of the repository
 * @param {string} repo The name of the repository
 * @param {string} branch The branch name where the file will be stored
 * @param {string} accessToken GitHub access token
 */
export function opfsWriteBase64Model(content, shaHash, originalFilePath, owner, repo, branch, accessToken) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({
    command: 'writeBase64Model',
    content: content,
    shaHash: shaHash,
    originalFilePath: originalFilePath,
    owner: owner,
    repo: repo,
    branch: branch,
    accessToken: accessToken,
  })
}

/**
 * Reads a file from the OPFS storage.
 *
 * Sends a request to a worker to read a file specified by its name
 * from the OPFS storage. This operation is contingent upon the worker
 * being properly initialized beforehand. If the worker is not initialized,
 * an error message is logged indicating the initialization issue.
 *
 * @param {string} fileName The name of the file to be read from the storage
 */
export function opfsReadFile(fileName) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({
    command: 'readObjectFromStorage',
    fileName: fileName,
  })
}


/**
 * Reads a model from the OPFS storage by its key.
 *
 * This function communicates with a worker to retrieve a model
 * from the OPFS storage using its unique key. It checks if the
 * worker is initialized before sending the postMessage command.
 * If the worker is not initialized, it logs an error message.
 *
 * @param {string} modelKey - The key associated with the model to be read from storage
 */
export function opfsReadModel(modelKey) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({
    command: 'readModelFromStorage',
    modelKey: modelKey,
  })
}

/**
 * Clears the OPFS cache
 */
export function opfsClearCache() {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({
    command: 'clearCache',
  })
}

/**
 * Retrieves a directory snapshot of the OPFS cache.
 *
 * @param {number} [previewWindow] Number of leading bytes per file to include (0 = disabled).
 */
export function opfsSnapshotCache(previewWindow = 0) {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({
    command: 'snapshotCache',
    previewWindow: previewWindow,
  })
}

/**
 * Sets a callback function to handle messages from the worker.
 *
 * Registers a callback function to be invoked whenever the worker
 * sends a message back to the main thread. This setup is conditional
 * upon the worker reference being initialized; if no worker reference
 * exists, the function does nothing.
 *
 * @param {Function} callback - The callback function to handle messages from the worker
 */
export function onWorkerMessage(callback) {
  if (workerRef) {
    workerRef.onmessage = callback
  }
}
