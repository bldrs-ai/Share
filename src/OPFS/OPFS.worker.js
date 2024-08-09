// opfsWorker.js


/**
 * @global
 * @typedef {object} CacheModule
 * @property {function(string): Promise<boolean>} checkCacheRaw Function to check the cache.
 */

/* global importScripts, CacheModule */
importScripts('./Cache.js')

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
    } else if (event.data.command === 'downloadModel') {
      const {objectUrl, originalFilePath, owner, repo, branch, accessToken, onProgress} =
      assertValues(event.data,
        ['objectUrl', 'originalFilePath', 'owner', 'repo', 'branch', 'accessToken', 'onProgress'])
      await downloadModel(objectUrl, originalFilePath, owner, repo, branch, accessToken, onProgress)
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

// Function to fetch the latest commit hash
/**
 *
 */
async function fetchLatestCommitHash(baseURL, owner, repo, filePath, accessToken, branch) {
  const url = `${baseURL}/repos/${owner}/${repo}/commits?sha=${branch}&path=${filePath}`
  const headers = accessToken ? {Authorization: `Bearer ${accessToken}`} : {}

  const response = await fetch(url, {headers})

  if (!response.ok) {
    throw new Error(`Failed to fetch commits: ${response.statusText}`)
  }

  const data = await response.json()

  if (data.length === 0) {
    throw new Error('No commits found for the specified file.')
  }

  const latestCommitHash = data[0].sha
  // eslint-disable-next-line no-console
  console.log(`The latest commit hash for the file is: ${latestCommitHash}`)
  return latestCommitHash
}

/**
 * Fetch the final URL and make a HEAD request
 */
async function fetchAndHeadRequest(jsonUrl, etag_ = null) {
  try {
    const STATUS_CACHED = 304
    // Step 1: Fetch the JSON response with ETag header if provided
    const fetchOptions = etag_ ? {headers: {ETag: etag_}} : {}
    const proxyResponse = await fetch(jsonUrl, fetchOptions)

    if (proxyResponse.status === STATUS_CACHED) {
      // eslint-disable-next-line no-console
      console.log('Cached version is valid')
      return null
    }

    if (!proxyResponse.ok) {
      throw new Error('Failed to fetch JSON response')
    }

    // clone response
    const clonedResponse = proxyResponse.clone()

    const json = await clonedResponse.json()

    // eslint-disable-next-line no-unused-vars
    const {_, etag, finalURL} = json

    // Step 3: fetch model
    const modelResponse = await fetch(finalURL)

    if (!modelResponse.ok) {
      throw new Error('Failed to make model request')
    }

    return {proxyResponse, modelResponse, etag}
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error:', error)
  }
}

// Function to write temporary file to OPFS (Origin Private File System)
/**
 *
 */
async function writeTemporaryFileToOPFS(response, originalFilePath, hexStringEtag, onProgress) {
  const opfsRoot = await navigator.storage.getDirectory()
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null

  // lets see if our etag matches
  // Get file handle for file blob
  try {
    [modelDirectoryHandle, modelBlobFileHandle] = await
    retrieveFileWithPathNew(opfsRoot, originalFilePath, hexStringEtag, null, false)

    if (modelBlobFileHandle !== undefined) {
      const blobFile = await modelBlobFileHandle.getFile()

      self.postMessage({completed: true, event: 'download', file: blobFile})
      return [modelDirectoryHandle, modelBlobFileHandle]
    }
  } catch (error) {
    // expected if file not found
  }
  let blobAccessHandle = null

  try {
    [modelDirectoryHandle, modelBlobFileHandle] = await writeFileToPath(opfsRoot, originalFilePath, hexStringEtag, null)
    // Create FileSystemSyncAccessHandle on the file.
    blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()
  } catch (error) {
    const workerMessage = `Error getting file handle for ${originalFilePath}: ${error}`
    self.postMessage({error: workerMessage})
    return
  }

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
        const workerMessage = `Error writing to ${response.headers.etag}: ${error}.`
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
      // if done, the file should be written. Signal the worker has completed.
      try {
        const blobFile = await modelBlobFileHandle.getFile()

        self.postMessage({completed: true, event: 'download', file: blobFile})

        return [modelDirectoryHandle, modelBlobFileHandle]
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
async function downloadModel(objectUrl, originalFilePath, owner, repo, branch, accessToken, onProgress) {
  const opfsRoot = await navigator.storage.getDirectory()
  const cacheKey = `${owner}/${repo}/${branch}/${originalFilePath}`
  const cached = await CacheModule.checkCacheRaw(cacheKey)

  const cacheExist = cached && cached.headers
  let _etag = null
  let commitHash = null
  let hexStringEtag = null
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null


  if (cacheExist) {
    // eslint-disable-next-line no-unused-vars
    const {_, etag, finalURL} = await cached.json()
    _etag = etag

      // Remove any enclosing quotes from the ETag value
    const cleanEtag = _etag.replace(/"/g, '')
    const HEXADECIMAL = 16

    // Convert the ETag to a hex string
    hexStringEtag = Array.from(cleanEtag).map((char) =>
    char.charCodeAt(0).toString(HEXADECIMAL).padStart(2, '0')).join('')

    if (cached.headers.get('commithash')) {
      commitHash = cached.headers.get('commithash')
    }
  }

  // const etag = "\"d3796370c5691ef25bbc6e829194623e4a2521a78092fa3abec23c0e8fe34e1a\""
  const result = await fetchAndHeadRequest(objectUrl, _etag)

  if (result === null) {
    // result SHOULD be cached, let's see.
    try {
      [modelDirectoryHandle, modelBlobFileHandle] = await
      retrieveFileWithPathNew(opfsRoot, cacheKey, hexStringEtag, commitHash === null ? 'temporary' : commitHash, false)

      if (modelBlobFileHandle !== null ) {
        // Display model
        const blobFile = await modelBlobFileHandle.getFile()

        self.postMessage({completed: true, event: (commitHash === null ) ? 'download' : 'exists', file: blobFile})

        if (commitHash !== null) {
          return
        }
        // TODO: get commit hash
        const _commitHash = await fetchLatestCommitHash('https://api.github.com', owner, repo, originalFilePath, accessToken, branch)

        if (_commitHash !== null) {
          const pathSegments = originalFilePath.split('/') // Split the path into segments
          const lastSegment = pathSegments[pathSegments.length - 1]
          const newFileName = `${lastSegment }.${hexStringEtag}.${ commitHash === null ? 'temporary' : commitHash}`
          const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

          if (newResult !== null) {
            // Update cache with new data
            await CacheModule.updateCacheRaw(cacheKey, proxyResponse, _commitHash)
            const updatedBlobFile = await newResult.getFile()

            self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
          }
        }
      }
    } catch (error) {
      // expected if file not found - lets see if we have a temporary file

      if (commitHash !== null) {
        try {
          [modelDirectoryHandle, modelBlobFileHandle] = await
          retrieveFileWithPathNew(opfsRoot, cacheKey, hexStringEtag, 'temporary', false)

          if (modelBlobFileHandle !== null ) {
            // Display model and get commitHash
            const blobFile = await modelBlobFileHandle.getFile()

            self.postMessage({completed: true, event: 'download', file: blobFile})

            // eslint-disable-next-line no-console
            console.log('Getting commit hash...')
            // TODO: get commit hash here
            const _commitHash = await fetchLatestCommitHash('https://api.github.com', owner, repo, originalFilePath, accessToken, branch)

            if (_commitHash !== null) {
              const pathSegments = originalFilePath.split('/') // Split the path into segments
              const lastSegment = pathSegments[pathSegments.length - 1]
              const newFileName = `${lastSegment }.${hexStringEtag}.${ commitHash === null ? 'temporary' : commitHash}`
              const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

              if (newResult !== null) {
                // Update cache with new data
                await CacheModule.updateCacheRaw(cacheKey, proxyResponse, _commitHash)
                const updatedBlobFile = await newResult.getFile()

                self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
              }
            }
          }
        } catch (error_) {
          // expected if file not found - invalidate cache and try again
          // eslint-disable-next-line no-console
          console.log('File not found in cache, invalidating cache and request again with no etag')
          await CacheModule.deleteCache(cacheKey)
          downloadModel(objectUrl, originalFilePath, owner, repo, branch, accessToken, onProgress)
          return
        }
      }

      // eslint-disable-next-line no-console
      console.log('File not found in cache, invalidating cache and request again with no etag')
      await CacheModule.deleteCache(cacheKey)
      downloadModel(objectUrl, originalFilePath, owner, repo, branch, accessToken, onProgress)
      return
    }
  }

  // not cached, download model
  const {proxyResponse, modelResponse, etag} = result

   // Remove any enclosing quotes from the ETag value
   const cleanEtag = etag.replace(/"/g, '')
   const HEXADECIMAL = 16

   // Convert the ETag to a hex string
  hexStringEtag = Array.from(cleanEtag).map((char) =>
  char.charCodeAt(0).toString(HEXADECIMAL).padStart(2, '0')).join('');

  [modelDirectoryHandle, modelBlobFileHandle] = await writeTemporaryFileToOPFS(modelResponse, cacheKey, hexStringEtag, onProgress)

  // Update cache with new data
  const clonedResponse = proxyResponse.clone()
  await CacheModule.updateCacheRaw(cacheKey, clonedResponse, null)

  // TODO: get commit hash
  const _commitHash = await fetchLatestCommitHash('https://api.github.com', owner, repo, originalFilePath, accessToken, branch)

  if (_commitHash !== null) {
    const pathSegments = originalFilePath.split('/') // Split the path into segments
    const lastSegment = pathSegments[pathSegments.length - 1]
    const newFileName = `${lastSegment }.${hexStringEtag}.${ _commitHash === null ? 'temporary' : _commitHash}`
    const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

    if (newResult !== null) {
      // Update cache with new data
      await CacheModule.updateCacheRaw(cacheKey, proxyResponse, _commitHash)
      const updatedBlobFile = await newResult.getFile()

      self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
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
 * writeFileToPath
 */
async function writeFileToPath(rootHandle, filePath, etag, commitHash = null) {
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
        const fileHandle = await
        currentHandle.getFileHandle(`${segment }.${etag}.${ commitHash === null ? 'temporary' : commitHash}`,
           {create: true})
        return [currentHandle, fileHandle] // Return the file handle for further processing
      } catch (error) {
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
async function retrieveFileWithPathNew(rootHandle, filePath, etag, commitHash, create = false) {
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
        const fileHandle = await
        currentHandle.getFileHandle(`${segment }.${etag}.${ commitHash === null ? 'temporary' : commitHash}`,
           {create: create})
        return [currentHandle, fileHandle] // Return the file handle for further processing
      } catch (error) {
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

  // Get a file handle in the folder for the model
  let blobAccessHandle = null

  const cacheKey = `${owner}/${repo}/${branch}/${originalFilePath}`

  const cached = await CacheModule.checkCacheRaw(cacheKey)

  const cacheExist = cached && cached.headers
  let _etag = null
  let hexStringEtag = null
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null


  if (cacheExist) {
    // eslint-disable-next-line no-unused-vars
    const {_, etag, finalURL} = await cached.json()
    _etag = etag

      // Remove any enclosing quotes from the ETag value
    const cleanEtag = _etag.replace(/"/g, '')
    const HEXADECIMAL = 16
    // Convert the ETag to a hex string
    hexStringEtag = Array.from(cleanEtag).map((char) =>
    char.charCodeAt(0).toString(HEXADECIMAL).padStart(2, '0')).join('')
  }

  // const etag = "\"d3796370c5691ef25bbc6e829194623e4a2521a78092fa3abec23c0e8fe34e1a\""
  // TODO: pass objectUrl
  // eslint-disable-next-line no-undef
  const result = await fetchAndHeadRequest(objectUrl, _etag)

  if (result !== null) {
      // not cached, download model
    // eslint-disable-next-line no-unused-vars
    const {proxyResponse, modelResponse, etag} = result

    // Remove any enclosing quotes from the ETag value
    const cleanEtag = etag.replace(/"/g, '')
    const HEXADECIMAL = 16

    // Convert the ETag to a hex string
    hexStringEtag = Array.from(cleanEtag).map((char) =>
    char.charCodeAt(0).toString(HEXADECIMAL).padStart(2, '0')).join('')

    try {
      // eslint-disable-next-line no-unused-vars
      [modelDirectoryHandle, modelBlobFileHandle] = await
      retrieveFileWithPathNew(opfsRoot, originalFilePath, hexStringEtag, objectKey, true)
      // Create FileSystemSyncAccessHandle on the file.
      blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()

      if (await writeFileToHandle(blobAccessHandle, modelFile)) {
        // Update cache with new data
        await CacheModule.updateCacheRaw(cacheKey, proxyResponse, objectKey)
        self.postMessage({completed: true, event: 'write'})
      }
    } catch (error) {
      const workerMessage = `Error getting file handle for ${originalFilePath}: ${error}`
      self.postMessage({error: workerMessage})
    }
  }
}

// Function to rename the file in OPFS
/**
 *
 */
async function renameFileInOPFS(parentDirectory, fileHandle, newFileName) {
  const newFileHandle = await parentDirectory.getFileHandle(newFileName, {create: true})

  // Copy the contents of the old file to the new file
  const oldFile = await fileHandle.getFile()
  const writable = await newFileHandle.createWritable()
  await writable.write(await oldFile.arrayBuffer())
  await writable.close()

  // Remove the old file
  await parentDirectory.removeEntry(fileHandle.name)

  return newFileHandle
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

