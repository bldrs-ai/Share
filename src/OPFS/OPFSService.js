import debug from '../utils/debug'

// TODO(pablo): probably don't need global state, can
// pass worker refs as needed.
let workerRef = null

export const initializeWorker = () => {
  if (workerRef === null) {
    workerRef = new Worker('/OPFS.Worker.js')
  }

  return workerRef
}

export const terminateWorker = () => {
  if (workerRef) {
    workerRef.terminate()
    workerRef = null
  }
}

export const opfsWriteFile = (objectUrl, fileName) => {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({command: 'writeObjectURLToFile', objectUrl: objectUrl, fileName: fileName})
}

export const opfsWriteModel = (objectUrl, originalFileName, commitHash) => {
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

export const opfsWriteModelFileHandle = (file, originalFileName, commitHash, owner, repo, branch) => {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({
    command: 'writeObjectModelFileHandle',
    file: file,
    objectKey: commitHash,
    originalFileName: originalFileName,
    owner: owner,
    repo: repo,
    branch: branch,
  })
}

export const opfsDownloadToOPFS = (objectUrl, commitHash, originalFilePath, owner, repo, branch, onProgress) => {
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

export const opfsReadFile = (fileName) => {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({command: 'readObjectFromStorage', fileName: fileName})
}

export const opfsReadModel = (modelKey) => {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }

  workerRef.postMessage({command: 'readModelFromStorage', modelKey: modelKey})
}

export const onWorkerMessage = (callback) => {
  if (workerRef) {
    workerRef.onmessage = callback
  }
}
