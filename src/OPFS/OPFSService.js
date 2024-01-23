import debug from '../utils/debug'

// OPFSService.js
let workerRef = null

export const initializeWorker = () => {
  if (workerRef === null) {
    workerRef = workerRef = new Worker('/OPFS.Worker.js')
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

export const opfsWriteModel = (objectUrl, objectKey, originalFileName, commitHash) => {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({command: 'writeObjectModel',
    objectUrl: objectUrl,
    objectKey: objectKey,
    originalFileName: originalFileName,
    commitHash: commitHash})
}

export const opfsDownloadToOPFS = (objectUrl, commitHash, originalFilePath, owner, repo, onProgress) => {
  if (!workerRef) {
    debug().error('Worker not initialized')
    return
  }
  workerRef.postMessage({command: 'downloadToOPFS',
    objectUrl: objectUrl,
    commitHash: commitHash,
    originalFilePath: originalFilePath,
    owner: owner,
    repo: repo,
    onProgress: onProgress})
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
