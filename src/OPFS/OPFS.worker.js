// opfsWorker.js

self.addEventListener('message', async (event) => {
  try {
    if (event.data.command === 'writeObjectURLToFile') {
      const objectUrl = event.data.objectUrl
      const fileName = event.data.fileName
      await writeFileToOPFS(objectUrl, fileName)
    } else if (event.data.command === 'readObjectFromStorage') {
      const fileName = event.data.fileName
      await readFileFromOPFS(fileName)
    } else if (event.data.command === 'writeObjectModel') {
      const objectUrl = event.data.objectUrl
      const objectKey = event.data.objectKey
      const originalFileName = event.data.originalFileName
      const commitHash = event.data.commitHash

      writeModelToOPFS(objectUrl, objectKey, originalFileName, commitHash)
    } else if (event.data.command === 'readModelFromStorage') {
      const modelKey = event.data.modelKey
      await readModelFromOPFS(modelKey)
    } else if (event.data.command === 'downloadToOPFS') {
      const objectUrl = event.data.objectUrl
      const commitHash = event.data.commitHash
      const onProgress = event.data.onProgress
      const originalFilePath = event.data.originalFilePath
      await downloadModelToOPFS(objectUrl, commitHash, originalFilePath, onProgress)
    }
  } catch (error) {
    self.postMessage({error: error.message})
  }
})

/**
 *
 */
async function downloadModelToOPFS(objectUrl, commitHash, originalFilePath, onProgress) {
  const textEncoder = new TextEncoder()
  const opfsRoot = await navigator.storage.getDirectory()
  let newFolderHandle = null

  // See if folder handle exists
  try {
    newFolderHandle = await opfsRoot.getDirectoryHandle(commitHash, {create: false})
    if (newFolderHandle !== null) {
      self.postMessage({completed: true, event: 'exists', fileName: commitHash})
      return
    }
  } catch (error) {
    // Ignore errors here, as it is a valid operation if the folder does
    // not exist yet.
  }

  try {
    newFolderHandle = await opfsRoot.getDirectoryHandle(commitHash, {create: true})
  } catch (error) {
    const workerMessage = `Error getting folder handle for ${commitHash}: ${error}`
    self.postMessage({error: workerMessage})
    return
  }

  // Get a file handle in the folder for the model
  let modelBlobFileHandle = null
  let blobAccessHandle = null
  // Get file handle for file blob
  try {
    modelBlobFileHandle = await newFolderHandle.getFileHandle(commitHash, {create: true})
    // Create FileSystemSyncAccessHandle on the file.
    blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()
  } catch (error) {
    const workerMessage = `Error getting file handle for ${commitHash}: ${error}`
    self.postMessage({error: workerMessage})
    return
  }
  // Fetch the file from the object URL
  const response = await fetch(objectUrl)

  if (!response.body) {
    throw new Error('ReadableStream not supported in this browser.')
  }

  const reader = response.body.getReader()
  const contentLength = +response.headers.get('Content-Length')

  let receivedLength = 0 // length of received bytes

  let isDone = false

  try {
    while (!isDone) {
      const {done, value} = await reader.read()

      if (done) {
        isDone = true
        break
      }

      try {
        if (value !== undefined) {
          // Write buffer
          // eslint-disable-next-line no-unused-vars
          const blobWriteSize = await blobAccessHandle.write(value, {at: receivedLength})

          /* if (blobWriteSize !== value.length) {
            console.log('blob write size !== chunk length')
          }*/
        } /* else {
          console.log('nothing was read')
        }*/
      } catch (error) {
        const workerMessage = `Error writing to ${commitHash}: ${error}.`
        // Close the access handle when done
        await blobAccessHandle.close()
        self.postMessage({error: workerMessage})
        return
      }

      receivedLength += value.length

      if (onProgress) {
        self.postMessage({
          progressEvent: onProgress,
          lengthComputable: contentLength !== 0,
          contentLength: contentLength,
          receivedLength: receivedLength,
        })
      }
    }

    if (isDone) {
      // close blob handle
      await blobAccessHandle.close()
      const metaDataFileName = `${commitHash}.json`
      // if done, the file should be written. Write the metadata and signal the worker has completed.
      try {
        // Get file handle for metadata
        let metaDataFileHandle = null

        try {
          metaDataFileHandle = await newFolderHandle.getFileHandle(metaDataFileName, {create: true})
        } catch (error) {
          const workerMessage = `Error getting file handle for ${metaDataFileName}: ${error}`
          self.postMessage({error: workerMessage})
          return
        }

        // create metadata string
        const metaData = {
          fileName: originalFilePath,
          commitHash: commitHash,
        }

        const metaDataJsonString = JSON.stringify(metaData)

        // Create FileSystemSyncAccessHandle on the file.
        const metaDataAccessHandle = await metaDataFileHandle.createSyncAccessHandle()

        // Encode content to write to the file.
        const content = textEncoder.encode(metaDataJsonString)

        // Write buffer at the beginning of the file
        const metaDataWriteSize = await metaDataAccessHandle.write(content, {at: 0})
        // Close the access handle when done
        await metaDataAccessHandle.close()

        if (metaDataWriteSize > 0) {
          self.postMessage({completed: true, event: 'download', fileName: commitHash})
        }
      } catch (error) {
        const workerMessage = `Error writing to ${metaDataFileName}: ${error}.`
        self.postMessage({error: workerMessage})
        return
      }
    }
  } catch (error) {
    reader.cancel()
    self.postMessage({error: error})
  }
}

/**
 *
 */
async function writeModelToOPFS(objectUrl, objectKey, originalFileName, commitHash) {
  try {
    const textEncoder = new TextEncoder()
    const opfsRoot = await navigator.storage.getDirectory()

    let newFolderHandle = null

    // Get folder handle
    try {
      newFolderHandle = await opfsRoot.getDirectoryHandle(objectKey, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${objectKey}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }

    // Get a file handle in the folder for the model
    let modelBlobFileHandle = null

    // Get file handle for file blob
    try {
      modelBlobFileHandle = await newFolderHandle.getFileHandle(objectKey, {create: true})
    } catch (error) {
      const workerMessage = `Error getting file handle for ${objectKey}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }

    // Fetch the file from the object URL
    const response = await fetch(objectUrl)
    const fileBuffer = await response.blob() // Convert the response to a blob, which is a File-like object

    const fileArrayBuffer = await fileBuffer.arrayBuffer()

    try {
      // Create FileSystemSyncAccessHandle on the file.
      const blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()

      // Write buffer at the beginning of the file
      const blobWriteSize = await blobAccessHandle.write(fileArrayBuffer, {at: 0})
      // Close the access handle when done
      await blobAccessHandle.close()

      if (blobWriteSize > 0) {
        try {
          // Get file handle for metadata
          let metaDataFileHandle = null
          const metaDataFileName = `${objectKey}.json`
          try {
            metaDataFileHandle = await newFolderHandle.getFileHandle(metaDataFileName, {create: true})
          } catch (error) {
            const workerMessage = `Error getting file handle for ${metaDataFileName}: ${error}`
            self.postMessage({error: workerMessage})
            return
          }

          // create metadata string
          const metaData = {
            fileName: originalFileName,
            commitHash: commitHash,
          }

          const metaDataJsonString = JSON.stringify(metaData)

          // Create FileSystemSyncAccessHandle on the file.
          const metaDataAccessHandle = await metaDataFileHandle.createSyncAccessHandle()

          // Encode content to write to the file.
          const content = textEncoder.encode(metaDataJsonString)

          // Write buffer at the beginning of the file
          const metaDataWriteSize = await metaDataAccessHandle.write(content, {at: 0})
          // Close the access handle when done
          await metaDataAccessHandle.close()

          if (metaDataWriteSize > 0) {
            self.postMessage({completed: true, event: 'write', fileName: objectKey})
          }
        } catch (error) {
          const workerMessage = `Error writing to ${objectKey}: ${error}.`
          self.postMessage({error: workerMessage})
          return
        }
      } else {
        const workerMessage = `Error writing to file: ${objectKey}`
        self.postMessage({error: workerMessage})
      }
    } catch (error) {
      const workerMessage = `Error writing to ${objectKey}: ${error}.`
      self.postMessage({error: workerMessage})
      return
    }
  } catch (error) {
    const workerMessage = `Error writing object URL to file: ${error}`
    self.postMessage({error: workerMessage})
  }
}

/**
 *
 */
async function readModelFromOPFS(objectKey) {
  try {
    const opfsRoot = await navigator.storage.getDirectory()

    // Try to access an existing model folder
    let modelFolderHandle = null
    try {
      modelFolderHandle = await opfsRoot.getDirectoryHandle(objectKey)
    } catch (error) {
      const errorMessage = `Folder ${objectKey} not found: ${error}`
      self.postMessage({error: errorMessage})
      return // Exit if the file is not found
    }

    // Try to access metadata json
    let metaDataString = null
    try {
      const metaDataJsonHandle = await modelFolderHandle.getFileHandle(`${objectKey}.json`)
      const metaDataFileHandle = await metaDataJsonHandle.getFile()
      metaDataString = await metaDataFileHandle.text()
    } catch (error) {
      const errorMessage = `File ${objectKey} not found: ${error}`
      self.postMessage({error: errorMessage})
      return // Exit if the file is not found
    }

    // Try to access model blob
    try {
      const blobFileHandle = await modelFolderHandle.getFileHandle(objectKey)

      const blobFile = await blobFileHandle.getFile()

      self.postMessage({completed: true, event: 'read', file: blobFile, metaDataString: metaDataString})
    } catch (error) {
      const errorMessage = `Error retrieving File from ${objectKey}: ${error}.`
      self.postMessage({error: errorMessage})
      return
    }
  } catch (error) {
    const errorMessage = `Error retrieving File: ${error}.`
    self.postMessage({error: errorMessage})
  }
}

/**
 *
 */
async function writeFileToOPFS(objectUrl, fileName) {
  try {
    const opfsRoot = await navigator.storage.getDirectory()

    // Try to access an existing file
    let newFileHandle = null

    // Get file handle
    try {
      newFileHandle = await opfsRoot.getFileHandle(fileName, {create: true})
    } catch (error) {
      const workerMessage = `Error getting file handle for ${fileName}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }

    // Fetch the file from the object URL
    const response = await fetch(objectUrl)
    const fileBuffer = await response.blob() // Convert the response to a blob, which is a File-like object

    const fileArrayBuffer = await fileBuffer.arrayBuffer()

    try {
      // Create FileSystemSyncAccessHandle on the file.
      const accessHandle = await newFileHandle.createSyncAccessHandle()

      // Write buffer at the beginning of the file
      const writeSize = await accessHandle.write(fileArrayBuffer, {at: 0})
      // Close the access handle when done
      await accessHandle.close()

      if (writeSize > 0) {
        self.postMessage({completed: true, event: 'write', fileName: fileName})
      } else {
        const workerMessage = `Error writing to file: ${fileName}`
        self.postMessage({error: workerMessage})
      }
    } catch (error) {
      const workerMessage = `Error writing to ${fileName}: ${error}.`
      self.postMessage({error: workerMessage})
      return
    }
  } catch (error) {
    const workerMessage = `Error writing object URL to file: ${error}`
    self.postMessage({error: workerMessage})
  }
}

/**
 *
 */
async function readFileFromOPFS(fileName) {
  try {
    const opfsRoot = await navigator.storage.getDirectory()

    // Try to access an existing file
    let newFileHandle
    try {
      newFileHandle = await opfsRoot.getFileHandle(fileName)
    } catch (error) {
      const errorMessage = `File ${fileName} not found: ${error}`
      self.postMessage({error: errorMessage})
      return // Exit if the file is not found
    }

    try {
      const fileHandle = await newFileHandle.getFile()

      self.postMessage({completed: true, event: 'read', file: fileHandle})
    } catch (error) {
      const errorMessage = `Error retrieving File from ${fileName}: ${error}.`
      self.postMessage({error: errorMessage})
      return
    }
  } catch (error) {
    const errorMessage = `Error retrieving File: ${error}.`
    self.postMessage({error: errorMessage})
  }
}

