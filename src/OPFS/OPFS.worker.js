// opfsWorker.js

self.addEventListener('message', async (event) => {
  try {
    if (event.data.command === 'writeObjectURLToFile') {
      const {objectUrl, fileName} =
      assertValues(event.data, ['objectUrl', 'fileName'])
      await writeFileToOPFS(objectUrl, fileName)
    } else if (event.data.command === 'readObjectFromStorage') {
      const {fileName} = assertValues(event.data, ['fileName'])
      await readFileFromOPFS(fileName)
    } else if (event.data.command === 'writeObjectModel') {
      const {objectUrl, objectKey, originalFileName} =
          assertValues(event.data,
              ['objectUrl', 'objectKey', 'originalFileName'])

      writeModelToOPFS(objectUrl, objectKey, originalFileName)
    } else if (event.data.command === 'writeObjectModelFileHandle') {
      const {file, objectKey, originalFilePath, owner, repo, branch} =
          assertValues(event.data,
              ['file', 'objectKey', 'originalFilePath', 'owner', 'repo', 'branch'])
      writeModelToOPFSFromFile(file, objectKey, originalFilePath, owner, repo, branch)
    } else if (event.data.command === 'readModelFromStorage') {
      const {modelKey} = assertValues(event.data, ['modelKey'])
      await readModelFromOPFS(modelKey)
    } else if (event.data.command === 'downloadToOPFS') {
      const {objectUrl, commitHash, owner, repo, branch, onProgress, originalFilePath} =
          assertValues(event.data,
              ['objectUrl', 'commitHash', 'owner', 'repo', 'branch', 'onProgress', 'originalFilePath'])
      await downloadModelToOPFS(objectUrl, commitHash, originalFilePath, owner, repo, branch, onProgress)
    } else if (event.data.command === 'doesFileExist') {
      const {commitHash, originalFilePath, owner, repo, branch} =
          assertValues(event.data,
              ['commitHash', 'originalFilePath', 'owner', 'repo', 'branch'])

      await doesFileExistInOPFS(commitHash, originalFilePath, owner, repo, branch)
    } else if (event.data.command === 'deleteModel') {
      const {commitHash, originalFilePath, owner, repo, branch} =
          assertValues(event.data,
              ['commitHash', 'originalFilePath', 'owner', 'repo', 'branch'])

      await deleteModelFromOPFS(commitHash, originalFilePath, owner, repo, branch)
    } else if (event.data.command === 'clearCache') {
      await clearCache()
    } else if (event.data.command === 'snapshotCache') {
      await snapshotCache()
    }
  } catch (error) {
    self.postMessage({error: error.message})
  }
})

/**
 * Return directory snapshot of OPFS cache
 */
async function snapshotCache() {
  const opfsRoot = await navigator.storage.getDirectory()

  const directoryStructure = await traverseDirectory(opfsRoot)

  // Send the directory structure as a message to the main thread
  self.postMessage({completed: true, event: 'snapshot', directoryStructure: directoryStructure})
}

/**
 * Given a directory handle, traverse the directory
 */
async function traverseDirectory(dirHandle, path = '') {
  let entries = ''
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      entries += `${path}/${name}/\n`
      entries += await traverseDirectory(handle, `${path}/${name}`)
    } else if (handle.kind === 'file') {
      entries += `${path}/${name}\n`
    }
  }
  return entries
}

/**
 * Clear OPFS cache
 */
async function clearCache() {
  const opfsRoot = await navigator.storage.getDirectory()
  await deleteAllEntries(opfsRoot)

  // Send the directory structure as a message to the main thread
  self.postMessage({completed: true, event: 'clear'})
}

/**
 * Delete all entries for a given directory handle
 */
async function deleteAllEntries(dirHandle) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      await deleteAllEntries(handle)
      await dirHandle.removeEntry(name, {recursive: true})
    } else if (handle.kind === 'file') {
      await dirHandle.removeEntry(name)
    }
  }
}

/**
 *
 */
async function downloadModelToOPFS(objectUrl, commitHash, originalFilePath, owner, repo, branch, onProgress) {
  const opfsRoot = await navigator.storage.getDirectory()
  let ownerFolderHandle = null
  let repoFolderHandle = null
  let branchFolderHandle = null
  // See if owner folder handle exists
  try {
    ownerFolderHandle = await opfsRoot.getDirectoryHandle(owner, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (ownerFolderHandle === null) {
    try {
      ownerFolderHandle = await opfsRoot.getDirectoryHandle(owner, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${owner}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }
  }

  // See if repo folder handle exists
  try {
    repoFolderHandle = await ownerFolderHandle.getDirectoryHandle(repo, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (repoFolderHandle === null) {
    try {
      repoFolderHandle = await ownerFolderHandle.getDirectoryHandle(repo, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${repo}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }
  }

  // See if branch folder handle exists
  try {
    branchFolderHandle = await repoFolderHandle.getDirectoryHandle(branch, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (branchFolderHandle === null) {
    try {
      branchFolderHandle = await repoFolderHandle.getDirectoryHandle(branch, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${branch}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }
  }

  // Get a file handle in the folder for the model
  let modelBlobFileHandle = null
  let modelDirectoryHandle = null
  let blobAccessHandle = null
  const pathSegments = originalFilePath.split('/')
  const strippedFileName = pathSegments[pathSegments.length - 1]
  // lets see if our commit hash matches
  // Get file handle for file blob
  try {
    [modelDirectoryHandle, modelBlobFileHandle] = await
    retrieveFileWithPath(branchFolderHandle, originalFilePath, commitHash, false)
  } catch (error) {
    // expected if file not found
  }

  let fileIsCached = false
  if (modelBlobFileHandle !== null) {
    // file name is name.ifc.commitHash, we just want to compare commitHash
    const testCommitHash = modelBlobFileHandle.name.split(strippedFileName)[1].slice(1)
    if (commitHash === testCommitHash) {
      fileIsCached = true
    }
  }

  // if we have a file, we can delete it and will write a new one
  if (modelBlobFileHandle !== null ) {
    if (fileIsCached) {
      const blobFile = await modelBlobFileHandle.getFile()

      self.postMessage({completed: true, event: 'exists', file: blobFile})
      return
    } else {
      await modelBlobFileHandle.remove()
    }
  }
  try {
    // eslint-disable-next-line no-unused-vars
    [modelDirectoryHandle, modelBlobFileHandle] = await retrieveFileWithPath(branchFolderHandle, originalFilePath, commitHash, true)
    // Create FileSystemSyncAccessHandle on the file.
    blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()
  } catch (error) {
    const workerMessage = `Error getting file handle for ${originalFilePath}: ${error}`
    self.postMessage({error: workerMessage})
    return
  }
  // Fetch the file from the object URL
  const response = await fetch(objectUrl)

  if (!response.body) {
    throw new Error('ReadableStream not supported in this browser.')
  }

  const reader = response.body.getReader()
  const contentLength = response.headers.get('Content-Length')

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
        }
      } catch (error) {
        const workerMessage = `Error writing to ${commitHash}: ${error}.`
        // Close the access handle when done
        await blobAccessHandle.close()
        self.postMessage({error: workerMessage})
        return
      }

      receivedLength += value.length

      if (onProgress) {
        // Variable names reflect MDN ProgressEvent field names
        // https://developer.mozilla.org/en-US/docs/Web/API/ProgressEvent
        self.postMessage({
          progressEvent: onProgress, // REVIEW: should this really be a function
                                     // value for an event varname, and tests
                                     // pass it a boolean?
          lengthComputable: contentLength !== 0,
          total: contentLength,
          loaded: receivedLength,
        })
      }
    }

    if (isDone) {
      // close blob handle
      await blobAccessHandle.close()
      // if done, the file should be written. Write the metadata and signal the worker has completed.
      try {
        const blobFile = await modelBlobFileHandle.getFile()

        self.postMessage({completed: true, event: 'download', file: blobFile})
      } catch (error) {
        const workerMessage = `Error Getting file handle: ${error}.`
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
async function retrieveFileWithPath(rootHandle, filePath, commitHash, shouldCreate = true) {
  const pathSegments = filePath.split('/') // Split the path into segments
  let currentHandle = rootHandle

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]
    const isLastSegment = i === pathSegments.length - 1

    if (!isLastSegment) {
      // Try to get the directory handle; if it doesn't exist, create it
      try {
        currentHandle = await currentHandle.getDirectoryHandle(segment, {create: true})
      } catch (error) {
        const workerMessage = `Error getting/creating directory handle for segment: ${error}.`
        self.postMessage({error: workerMessage})
        return null
      }
    } else {
      // Last segment, treat it as a file
      try {
        // Create or get the file handle
        const fileHandle = await currentHandle.getFileHandle(`${segment }.${ commitHash}`, {create: shouldCreate})
        return [currentHandle, fileHandle] // Return the file handle for further processing
      } catch (error) {
        if (!shouldCreate) {
          return null
        }
        const workerMessage = `Error getting/creating file handle for file ${segment}: ${error}.`
        self.postMessage({error: workerMessage})
        return null
      }
    }
  }
}

/**
 *
 */
async function writeFileToHandle(blobAccessHandle, modelFile) {
  try {
    // Step 1: Convert the File to an ArrayBuffer
    const arrayBuffer = await modelFile.arrayBuffer()

    // Optional: Truncate the file if you want to overwrite it completely
    await blobAccessHandle.truncate(0)

    // Step 2: Write the ArrayBuffer to the blobAccessHandle
    await blobAccessHandle.write(arrayBuffer)

    // Step 3: Close the handle after writing is done
    await blobAccessHandle.close()

    return true
  } catch (error) {
    const workerMessage = `Error writing file to handle: ${error}`
      self.postMessage({error: workerMessage})
      return false
  }
}

/**
 *
 */
async function writeModelToOPFSFromFile(modelFile, objectKey, originalFilePath, owner, repo, branch) {
  const opfsRoot = await navigator.storage.getDirectory()
  let ownerFolderHandle = null
  let repoFolderHandle = null
  let branchFolderHandle = null
  // See if owner folder handle exists
  try {
    ownerFolderHandle = await opfsRoot.getDirectoryHandle(owner, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (ownerFolderHandle === null) {
    try {
      ownerFolderHandle = await opfsRoot.getDirectoryHandle(owner, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${owner}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }
  }

  // See if repo folder handle exists
  try {
    repoFolderHandle = await ownerFolderHandle.getDirectoryHandle(repo, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (repoFolderHandle === null) {
    try {
      repoFolderHandle = await ownerFolderHandle.getDirectoryHandle(repo, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${repo}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }
  }

  // See if branch folder handle exists
  try {
    branchFolderHandle = await repoFolderHandle.getDirectoryHandle(branch, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (branchFolderHandle === null) {
    try {
      branchFolderHandle = await repoFolderHandle.getDirectoryHandle(branch, {create: true})
    } catch (error) {
      const workerMessage = `Error getting folder handle for ${branch}: ${error}`
      self.postMessage({error: workerMessage})
      return
    }
  }

  // Get a file handle in the folder for the model
  let modelBlobFileHandle = null
  let modelDirectoryHandle = null
  let blobAccessHandle = null

  try {
    // eslint-disable-next-line no-unused-vars
    [modelDirectoryHandle, modelBlobFileHandle] = await retrieveFileWithPath(branchFolderHandle, originalFilePath, objectKey, true)
    // Create FileSystemSyncAccessHandle on the file.
    blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()

    if (await writeFileToHandle(blobAccessHandle, modelFile)) {
      self.postMessage({completed: true, event: 'write'})
    }
  } catch (error) {
    const workerMessage = `Error getting file handle for ${originalFilePath}: ${error}`
    self.postMessage({error: workerMessage})
  }
}

/**
 * This function navigates to a filepath in OPFS to see if it exists.
 * If any parent folders or the file do not exist, it will return 'notexist'.
 * If it exists, it will return 'exist'
 *
 * @param {*} commitHash
 * @param {*} originalFilePath
 * @param {*} owner
 * @param {*} repo
 * @param {*} branch
 * @return {string} postmessage specifying operation status
 */
async function doesFileExistInOPFS(commitHash, originalFilePath, owner, repo, branch) {
  const opfsRoot = await navigator.storage.getDirectory()
  let ownerFolderHandle = null
  let repoFolderHandle = null
  let branchFolderHandle = null
  // See if owner folder handle exists
  try {
    ownerFolderHandle = await opfsRoot.getDirectoryHandle(owner, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (ownerFolderHandle === null) {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
    return
  }

  // See if repo folder handle exists
  try {
    repoFolderHandle = await ownerFolderHandle.getDirectoryHandle(repo, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (repoFolderHandle === null) {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
    return
  }

  // See if branch folder handle exists
  try {
    branchFolderHandle = await repoFolderHandle.getDirectoryHandle(branch, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (branchFolderHandle === null) {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
    return
  }

  // Get a file handle in the folder for the model
  let modelBlobFileHandle = null
  let modelDirectoryHandle = null
  const pathSegments = originalFilePath.split('/')
  const strippedFileName = pathSegments[pathSegments.length - 1]
  // lets see if our commit hash matches
  // Get file handle for file blob
  try {
    // eslint-disable-next-line no-unused-vars
    [modelDirectoryHandle, modelBlobFileHandle] = await
    retrieveFileWithPath(branchFolderHandle, originalFilePath, commitHash, false)
  } catch (error) {
    // expected if file not found
  }

  let fileIsCached = false
  if (modelBlobFileHandle !== null) {
    // file name is name.ifc.commitHash, we just want to compare commitHash
    const testCommitHash = modelBlobFileHandle.name.split(strippedFileName)[1].slice(1)
    if (commitHash === testCommitHash) {
      fileIsCached = true
    }
  }

  if (fileIsCached) {
    self.postMessage({completed: true, event: 'exist', commitHash: commitHash})
    return
  }

  self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
}

/**
 * This function navigates to the model location in OPFS and deletes it.
 * If any parent folders or the file do not exist, it will return 'notexist'.
 * If it successfully deletes the file, it will return 'deleted'.
 *
 * @param {*} commitHash
 * @param {*} originalFilePath
 * @param {*} owner
 * @param {*} repo
 * @param {*} branch
 * @return {string} postmessage specifying operation status
 */
async function deleteModelFromOPFS(commitHash, originalFilePath, owner, repo, branch) {
  const opfsRoot = await navigator.storage.getDirectory()
  let ownerFolderHandle = null
  let repoFolderHandle = null
  let branchFolderHandle = null
  // See if owner folder handle exists
  try {
    ownerFolderHandle = await opfsRoot.getDirectoryHandle(owner, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (ownerFolderHandle === null) {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
    return
  }

  // See if repo folder handle exists
  try {
    repoFolderHandle = await ownerFolderHandle.getDirectoryHandle(repo, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (repoFolderHandle === null) {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
    return
  }

  // See if branch folder handle exists
  try {
    branchFolderHandle = await repoFolderHandle.getDirectoryHandle(branch, {create: false})
  } catch (error) {
    // Expected: folder does not exist
  }

  if (branchFolderHandle === null) {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
    return
  }

  // Get a file handle in the folder for the model
  let modelBlobFileHandle = null
  const pathSegments = originalFilePath.split('/')
  const strippedFileName = pathSegments[pathSegments.length - 1]
  // lets see if our commit hash matches
  // Get file handle for file blob
  try {
    [, modelBlobFileHandle] = await
    retrieveFileWithPath(branchFolderHandle, originalFilePath, commitHash, false)
  } catch (error) {
    // expected if file not found
  }

  let fileIsCached = false
  if (modelBlobFileHandle !== null) {
    // file name is name.ifc.commitHash, we just want to compare commitHash
    const testCommitHash = modelBlobFileHandle.name.split(strippedFileName)[1].slice(1)
    if (commitHash === testCommitHash) {
      fileIsCached = true
    }
  }

  if (fileIsCached && modelBlobFileHandle !== null) {
    modelBlobFileHandle.remove()
  }

  self.postMessage({completed: true, event: 'deleted', commitHash: commitHash})
}

/**
 *
 */
async function writeModelToOPFS(objectUrl, objectKey, originalFileName) {
  try {
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
      await blobAccessHandle.write(fileArrayBuffer, {at: 0})
      // Close the access handle when done
      await blobAccessHandle.close()

      self.postMessage({completed: true, event: 'write', fileName: objectKey})
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

    // Try to access model blob
    try {
      const blobFileHandle = await modelFolderHandle.getFileHandle(objectKey)

      const blobFile = await blobFileHandle.getFile()

      self.postMessage({completed: true, event: 'read', file: blobFile})
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

/**
 * Checks that each named param is defined and returns the object for chaining.
 *
 * @param {any} obj Variable length arguments to assert are defined.
 * @param {Array<string>} keys That was passed in
 * @return {any} obj That object that was passed in, if valid
 * @throws If any argument is not defined.
 */
function assertValues(obj, keys) {
  const undefinedKeys = keys.filter((key) => obj[key] === undefined)
  if (undefinedKeys.length > 0) {
    throw new Error(`The following keys are undefined: 
      ${undefinedKeys.join(', ')}`)
  }
  return obj
}

