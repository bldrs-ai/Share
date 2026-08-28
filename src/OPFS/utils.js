import {
  initializeWorker,
  nextRequestId,
  opfsDownloadToOPFS,
  opfsDownloadModel,
  opfsReadModel,
  opfsReadModelByPath,
  opfsWriteBytesByPath,
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
 * Run one request against the OPFS worker and settle a Promise from *its own*
 * replies.
 *
 * `initializeWorker()` returns one worker per origin, so every helper in this
 * file listens to the same message stream. Before correlation each listener
 * settled on the first reply that merely *looked* right — any `wrote`, any
 * `error` — no matter which operation produced it. `writeGlbBytesToOPFS` was
 * the sharp edge (#1785): the GLB cache-hit specs reload the page when they see
 * `writer: wrote`, so resolving on someone else's write reintroduces the
 * half-written-artifact read that #1783 fixed. The error branch was worse still
 * — an unrelated operation's failure rejected whatever promise was listening.
 *
 * Correlation is a per-request id, not the `commitHash` the worker already
 * echoed: the hash is absent from every error reply, and two concurrent writes
 * of the same model at the same commit — the GLB writer runs fire-and-forget on
 * `requestIdleCallback`, so that overlap is a scheduling accident away — share
 * one hash and would still cross-talk. The id is minted here, posted with the
 * command (`OPFSService`), and stamped on every reply the worker produces for
 * it (`OPFS.worker.js` `postReply`).
 *
 * @param {function(string): void} kickoff Posts the command, given the request
 *   id to stamp on it. Called after the listener is attached so no reply is
 *   missed.
 * @param {function(object, {resolve: Function, reject: Function}): void} onReply
 *   Handles each of this request's replies. Settling detaches the listener;
 *   returning without settling waits for the next reply (progress events).
 * @return {Promise<*>}
 */
function workerRequest(kickoff, onReply) {
  return new Promise((resolve, reject) => {
    const workerRef = initializeWorker()
    if (workerRef === null) {
      reject(new Error('Worker initialization failed'))
      return
    }
    const requestId = nextRequestId()
    let listener = null
    const settle = {
      resolve: (value) => {
        workerRef.removeEventListener('message', listener)
        resolve(value)
      },
      reject: (error) => {
        workerRef.removeEventListener('message', listener)
        reject(error)
      },
    }
    listener = (event) => {
      if (event.data.requestId !== requestId) {
        return
      }
      if (event.data.requestFinished) {
        // The worker's handler returned without a terminal reply. Pre-#1785
        // that hung forever and left this listener attached to the shared
        // worker for the life of the page; the worker now closes every request
        // out so the hang surfaces and the listener always detaches.
        settle.reject(new Error(`OPFS worker finished ${requestId} without a reply`))
        return
      }
      onReply(event.data, settle)
    }
    workerRef.addEventListener('message', listener)
    kickoff(requestId)
  })
}


/**
 * Write model to OPFS.
 *
 * @param {File} modelFile - The model file
 * @param {string} originalFilePath - Original file path
 * @param {string} commitHash - Commit hash
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @return {Promise<File>}
 */
export function writeSavedGithubModelOPFS(modelFile, originalFilePath, commitHash, owner, repo, branch) {
  return workerRequest(
    (requestId) => opfsWriteModelFileHandle(modelFile, originalFilePath, commitHash, owner, repo, branch, requestId),
    (data, settle) => {
      if (data.error) {
        debug().error('Error from worker:', data.error)
        settle.resolve(false)
        return
      }
      if (data.completed && data.event === 'write') {
        debug().log('Worker finished writing file')
        settle.resolve(true)
      }
    })
}


/**
 * Retrieve model from OPFS.
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @param {string} filepath - File path
 * @return {File}
 */
export function getModelFromOPFS(owner, repo, branch, filepath) {
  const parts = filepath.split('/')
  const fileName = parts[parts.length - 1]

  return workerRequest(
    (requestId) => opfsReadModel(fileName, requestId),
    (data, settle) => {
      if (data.error) {
        debug().error('Error from worker:', data.error)
        settle.reject(new Error(data.error))
        return
      }
      if (data.completed) {
        debug().log('Worker finished retrieving file')
        settle.resolve(data.file)
      }
    })
}


/**
 * Download model to OPFS if it doesn't already exist
 * with a matching commit hash.
 *
 * @param {string} objectUrl - Object URL
 * @param {string} originalFilePath - Original file path
 * @param {string} commitHash - Commit hash
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @param {Function} onProgress - Progress callback
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

  return workerRequest(
    (requestId) =>
      opfsDownloadToOPFS(objectUrl, commitHash, originalFilePath, owner, repo, branch, !!(onProgress), requestId),
    (data, settle) => {
      if (data.error) {
        debug().error('Error from worker:', data.error)
        settle.reject(new Error(data.error))
        return
      }
      if (data.progressEvent) {
        if (onProgress) {
          onProgress({
            lengthComputable: data.contentLength !== 0,
            total: data.total,
            loaded: data.loaded,
          }) // Custom progress event
        }
        return
      }
      if (data.completed) {
        if (data.event === 'download') {
          debug().warn('Worker finished downloading file')
        } else if (data.event === 'exists') {
          debug().warn('Commit exists in OPFS.')
        }
        settle.resolve(data.file)
      }
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
  return awaitTerminalWorkerEvent(
    (requestId) => opfsWriteBase64Model(content, shaHash, originalFilePath, owner, repo, branch, accessToken, requestId),
    {setOpfsFile})
}


/**
 * Subscribe to the OPFS worker's single-terminal-event protocol and return a
 * Promise that resolves with the final File (or rejects on `{error}`).
 *
 * The worker emits exactly one terminal `completed` event per request —
 * `exists`, `renamed`, or `download` (the last is the commit-hash / rename
 * fallback path; we still resolve with the un-renamed File so the load
 * completes). Progress events (`progressEvent: true`) are forwarded to
 * `onProgress` and don't terminate the listener.
 *
 * Extracted from the duplicate listeners in `downloadModel` /
 * `writeBase64Model` so the protocol contract lives in one place.
 *
 * @param {function(string): void} kickoff Invokes the corresponding
 *   `opfsService` entry point with the request id to stamp on the command.
 * @param {object} hooks
 * @param {Function} hooks.setOpfsFile Called with the resolved File.
 * @param {Function} [hooks.onProgress] Called on each progress update.
 * @param {Function} [hooks.onLastModifiedGithub] Called once with the commit
 *   epoch ms if the terminal event carries it.
 * @return {Promise<File>}
 */
function awaitTerminalWorkerEvent(kickoff, {setOpfsFile, onProgress, onLastModifiedGithub}) {
  return workerRequest(kickoff, (data, settle) => {
    if (data.error) {
      debug().error('Error from worker:', data.error)
      settle.reject(new Error(data.error))
      return
    }
    if (data.progressEvent) {
      if (onProgress) {
        onProgress({
          lengthComputable: data.contentLength !== 0,
          contentLength: data.contentLength,
          receivedLength: data.receivedLength,
        })
      }
      return
    }
    if (!data.completed) {
      return
    }
    // Terminal event. Log the variant for diagnostics, then resolve.
    if (data.event === 'download') {
      debug().warn('Worker finished downloading file')
    } else if (data.event === 'exists') {
      debug().warn('Commit exists in OPFS.')
    }
    if (data.lastModifiedGithub && onLastModifiedGithub) {
      onLastModifiedGithub(data.lastModifiedGithub)
    }
    const file = data.file
    if (file instanceof File) {
      setOpfsFile(file)
    } else {
      debug().error('Retrieved object is not of type File.')
    }
    settle.resolve(file)
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
 * @param {Function} [onLastModifiedGithub] Called with epoch ms when the latest commit date is available.
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
  onProgress,
  onLastModifiedGithub = null) {
  assertDefined(objectUrl, shaHash, originalFilePath, accessToken, owner, repo, branch, setOpfsFile, onProgress)
  return awaitTerminalWorkerEvent(
    (requestId) =>
      opfsDownloadModel(
        objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, !!(onProgress), requestId),
    {setOpfsFile, onProgress, onLastModifiedGithub})
}

/**
 * Executes an asynchronous task using the OPFS Web Worker and returns a promise
 * that resolves based on the task's outcome. Shared by the boolean-result
 * helpers (exists / delete / clear / snapshot) whose reply protocol is the same
 * beyond the event name they wait for.
 *
 * @param {function(string): void} kickoff Initiates the worker task, given the
 *     request id to stamp on the command so the reply can be told from a
 *     concurrent operation's — see {@link workerRequest}.
 * @param {string} eventStatus The specific event status the function waits for to resolve the promise
 *     This parameter allows the function to be used for various operations
 *     by specifying the expected success event type from the worker (e.g., 'deleted', 'written')
 * @return {Promise<boolean>} A promise that resolves to true if the worker completes the operation successfully
 *     and matches the `eventStatus`. If the worker encounters an error or if the event
 *     indicates that the file does not exist, the promise will reject with an error or
 *     resolve to false, respectively.
 */
function makePromise(kickoff, eventStatus) {
  return workerRequest(kickoff, (data, settle) => {
    if (data.error) {
      debug().error('Error from worker:', data.error)
      settle.reject(new Error(data.error))
      return
    }
    if (!data.completed) {
      return
    }
    if (data.event === 'notexist') {
      settle.resolve(false)
    } else if (data.event === eventStatus) {
      if (data.event === 'clear') {
        console.warn('OPFS cache cleared.')
      }
      if (data.directoryStructure) {
        console.warn(`OPFS Directory Structure:\n${ data.directoryStructure}`)
      }
      settle.resolve(true)
    }
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

  return makePromise(
    (requestId) => opfsDoesFileExist(originalFilePath, commitHash, owner, repo, branch, requestId),
    'exist')
}


/**
 * Write raw bytes to OPFS at the same `(owner/repo/branch/originalFilePath,
 * commitHash)` tuple used by {@link doesFileExistInOPFS} /
 * {@link readModelByPathFromOPFS}. Used by the GLB artifact writer to cache
 * a freshly-generated GLB next to its source.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {string} originalFilePath
 * @param {string} commitHash
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @return {Promise<boolean>} resolves to true on success
 */
export function writeGlbBytesToOPFS(bytes, originalFilePath, commitHash, owner, repo, branch) {
  assertDefined(bytes, originalFilePath, commitHash, owner, repo, branch)

  return workerRequest(
    (requestId) => opfsWriteBytesByPath(bytes, originalFilePath, commitHash, owner, repo, branch, requestId),
    (data, settle) => {
      if (data.error) {
        debug().error('Error from worker:', data.error)
        settle.reject(new Error(data.error))
        return
      }
      if (data.completed && data.event === 'wrote') {
        settle.resolve(true)
      }
    })
}


/**
 * Read a cached file from OPFS by its `(owner/repo/branch/originalFilePath,
 * commitHash)` tuple. Resolves to the File on success, or null if absent.
 *
 * @param {string} originalFilePath
 * @param {string} commitHash
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @return {Promise<File|null>}
 */
export function readModelByPathFromOPFS(originalFilePath, commitHash, owner, repo, branch) {
  assertDefined(originalFilePath, commitHash, owner, repo, branch)

  return workerRequest(
    (requestId) => opfsReadModelByPath(originalFilePath, commitHash, owner, repo, branch, requestId),
    (data, settle) => {
      if (data.error) {
        debug().error('Error from worker:', data.error)
        settle.reject(new Error(data.error))
        return
      }
      if (data.completed) {
        if (data.event === 'notexist') {
          settle.resolve(null)
        } else if (data.event === 'read') {
          settle.resolve(data.file)
        }
      }
    })
}

/**
 * Prints a snapshot of the OPFS directory structure
 *
 * @param {number} previewWindow - Preview window size
 * @return {Promise<boolean>}
 */
export function snapshotOPFS(previewWindow = 0) {
  return makePromise((requestId) => opfsSnapshotCache(previewWindow, requestId), 'snapshot')
}

/**
 * Deletes entirety of OPFS cache
 *
 * @return {boolean}
 */
export function clearOPFSCache() {
  return makePromise((requestId) => opfsClearCache(requestId), 'clear')
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

  return makePromise(
    (requestId) => opfsDeleteModel(originalFilePath, commitHash, owner, repo, branch, requestId),
    'deleted')
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

  const tmpUrl = URL.createObjectURL(file)
  debug().log('OPFS/utils#saveDnDFileToOpfs: event: url: ', tmpUrl)
  // Post message to the worker to handle the file
  const parts = tmpUrl.split('/')
  const fileNametmpUrl = parts[parts.length - 1]

  const originalFilename = file.name
  const filename = `${fileNametmpUrl}.${type}`
  debug().log('OPFS/utils#saveDnDFileToOpfs: calling opfsWriteModel with typed filename:', filename)

  workerRequest(
    (requestId) => opfsWriteModel(tmpUrl, originalFilename, filename, requestId),
    (data, settle) => {
      if (data.error) {
        settle.reject(new Error(data.error))
        return
      }
      if (data.completed) {
        if (data.event === 'write') {
          debug().log('Worker finished writing file')
          settle.resolve(data.fileName)
        } else if (data.event === 'read') {
          debug().log('Worker finished reading file')
          settle.resolve(data.file.name)
        }
      }
    })
    .then((fileName) => callback(fileName))
    .catch((error) => debug().error('Error from worker:', error))
    // We can't revoke tmpUrl until the worker is done with it, so revoke once
    // the request settles either way.
    .finally(() => URL.revokeObjectURL(tmpUrl))
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
