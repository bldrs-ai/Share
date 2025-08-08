let GITHUB_BASE_URL_AUTHENTICATED = null
let GITHUB_BASE_URL_UNAUTHENTICATED = null

// Conway WASM module - will be initialized when imported in worker
let conwayModule = null

/**
 * @global
 * @typedef {object} Cache
 * @property {function(string): Promise<boolean>} checkCacheRaw Function to check the
 */

/* global FileSystemDirectoryHandle, FileSystemFileHandle, FileSystemSyncAccessHandle */

/* global importScripts, Cache */
let Cache

/**
 *
 */
async function ensureCacheLoaded() {
  if (!Cache) {
    const mod = await import('../net/github/Cache.js')
    Cache = mod.default ?? mod // UMD/ESM interop
  }
}

const dynamicImport = new Function( 'module', 'return import(module)' )
let geometryConvertor = null

self.addEventListener('message', async (event) => {
  try {
    if (event.data.command === 'initializeWorker') {
      await ensureCacheLoaded()
      const {GITHUB_BASE_URL_AUTHED, GITHUB_BASE_URL_UNAUTHED} =
      assertValues(event.data, ['GITHUB_BASE_URL_AUTHED', 'GITHUB_BASE_URL_UNAUTHED'])

      GITHUB_BASE_URL_AUTHENTICATED = GITHUB_BASE_URL_AUTHED
      GITHUB_BASE_URL_UNAUTHENTICATED = GITHUB_BASE_URL_UNAUTHED
    } else if (event.data.command === 'initializeWasm') {
      const {wasmModulePath, memory} = assertValues(event.data, ['wasmModulePath', 'memory'])

      try {
        console.log('Importing Conway WASM module in worker:', wasmModulePath)

        // Use dynamic import instead of importScripts for ES6 modules
        const module = await dynamicImport(wasmModulePath)


        // Initialize Conway module - check for default export or named exports
        const ConwayGeomWasm = module.default || module.ConwayGeomWasm

        if (typeof ConwayGeomWasm === 'function') {
          // Configure Conway WASM with proper locateFile and pthread support
          const config = {
            noInitialRun: true,
            wasmMemory: memory,
            locateFile: (filename, prefix) => {
              if (filename.endsWith('.wasm')) {
                // Use multi-threaded version for pthread support
                return '/static/js/ConwayGeomWasmWebMT.wasm'
              } else if (filename.endsWith('ConwayGeomWasmWebMT.js')) {
                return '/static/js/ConwayGeomWasmWebMT.js'
              }
              // fallback
              return prefix + filename
            },
          }

          // Set mainScriptUrlOrBlob for pthread support
          config.mainScriptUrlOrBlob = '/static/js/ConwayGeomWasmWebMT.js'

          // Initialize Conway with proper config
          ConwayGeomWasm(config).then((wasmModule) => {
            // Initialize the geometry processor
            // const initialized = wasmModule.initializeGeometryProcessor()
            conwayModule = wasmModule
            console.log('Conway WASM module initialized in worker with pthread support:', conwayModule)
            geometryConvertor = new GeometryConvertor(conwayModule)
            self.postMessage({completed: true, event: 'wasmInitialized'})
          }).catch((error) => {
            console.error('Failed to initialize Conway module:', error)
            self.postMessage({error: `Failed to initialize Conway: ${error.message}`, event: 'wasmInitError'})
          })
        } else {
          throw new Error('ConwayGeomWasm function not found in module exports')
        }
      } catch (error) {
        console.error('Failed to import Conway WASM module:', error)
        self.postMessage({error: `Failed to import Conway: ${error.message}`, event: 'wasmInitError'})
      }
    } else if (event.data.command === 'exportToGlb') {
      const {geometryPtr, materialsPtr, chunks, fileNameNoExtension, owner, repo, branch, filePath} =
      assertValues(event.data, ['geometryPtr', 'materialsPtr', 'chunks', 'fileNameNoExtension', 'owner', 'repo', 'branch', 'filePath'])

      await exportToGlb(geometryPtr, materialsPtr, chunks, fileNameNoExtension, owner, repo, branch, filePath)
    } else if (event.data.command === 'writeObjectURLToFile') {
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
      const {objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, onProgress} =
      assertValues(event.data,
        ['objectUrl', 'shaHash', 'originalFilePath', 'owner', 'repo', 'branch', 'accessToken', 'onProgress'])
      await downloadModel(objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, onProgress)
    } else if (event.data.command === 'writeBase64Model') {
      const {content, shaHash, originalFilePath, owner, repo, branch, accessToken} =
      assertValues(event.data, ['content', 'shaHash', 'originalFilePath', 'owner', 'repo', 'branch', 'accessToken'])

    await writeBase64Model(content, shaHash, originalFilePath, owner, repo, branch, accessToken)
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
 *
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to traverse.
 * @param {string} [path] - The path to the directory.
 * @return {Promise<string>} The directory structure as a string.
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
 * Export aggregated geometry to GLB format and write to OPFS
 *
 * @param {object} aggregatedGeometry - The aggregated geometry data
 * @param {string} fileNameNoExtension - The base filename without extension
 * @param {string} owner - The owner of the repository
 * @param {string} repo - The repository name
 * @param {string} branch - The branch name
 * @param {string} filePath - The original file path
 */
async function exportToGlb(geometryPtr, materialsPtr, chunks, fileNameNoExtension, owner, repo, branch, filePath) {
  if (!conwayModule) {
throw new Error('Conway WASM module not initialized.')
}

  const startTimeGlb = Date.now()
  try {
    console.log('Converting geometry to GLB using Conway in worker...')

    const geometryConvertor = new GeometryConvertor(conwayModule)

    for await (const glbResult of geometryConvertor.toGltfs(
      geometryPtr,
      materialsPtr,
      chunks,
      true, // isGlb
      true, // outputDraco (you called it "merge" in a comment but passing true)
      `${fileNameNoExtension}_export`,
    )) {
      if (!glbResult?.success) {
        self.postMessage({error: 'GLB generation unsuccessful', event: 'glbExportError'})
        continue
      }

      if (glbResult.buffers.size() !== glbResult.bufferUris.size()) {
        self.postMessage({error: 'Buffer size mismatch during GLB export', event: 'glbExportError'})
        continue
      }

      for (let i = 0; i < glbResult.bufferUris.size(); i++) {
        const uri = glbResult.bufferUris.get(i)
        const managedBuffer = conwayModule.getUint8Array(glbResult.buffers.get(i))

        try {
          // Write the GLB file to OPFS (copy off the shared heap!)
          const cacheKey = `${owner}/${repo}/${branch}/${uri}`
          const [, glbFileHandle] = await writeFileToPath(
            await navigator.storage.getDirectory(),
            cacheKey,
            '.glb',
          )

          const copy = new Uint8Array(managedBuffer.byteLength)
          copy.set(managedBuffer)

          const writable = await glbFileHandle.createWritable()
          await writable.write(copy)
          await writable.close()

          console.log(`GLB file written to OPFS: ${uri}`)
        } catch (err) {
          console.error('Error writing GLB:', err)
          self.postMessage({error: `Error writing GLB file: ${err.message}`, event: 'glbExportError'})
        }
      }

      // free native containers if these are emscripten objects
      glbResult.bufferUris?.delete?.()
      glbResult.buffers?.delete?.()
    }

    self.postMessage({
      completed: true,
      event: 'glbExported',
      exportTime: Date.now() - startTimeGlb,
      // optional: you could sum counts if you want
    })
  } catch (error) {
    console.error('GLB export error:', error)
    self.postMessage({error: `GLB export error: ${error.message}`, event: 'glbExportError'})
  }
}


/**
 * Delete all entries for a given directory handle
 *
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to delete all entries from.
 * @return {Promise<void>}
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
 * Fetch the latest commit hash
 *
 * @param {string} baseURL - The base URL to fetch the latest commit hash from.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The repository name.
 * @param {string} filePath - The path to the file.
 * @param {string} accessToken - The access token to use for the request.
 * @param {string} branch - The branch to fetch the latest commit hash from.
 * @return {Promise<string>} The latest commit hash.
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
 *
 * @param {string} modelUrl - The URL to fetch the model from.
 * @return {Promise<Response>} The response from the request.
 */
async function fetchRGHUC(modelUrl) {
  try {
    // fetch model
    const modelResponse = await fetch(modelUrl)

    if (!modelResponse.ok) {
      throw new Error('Failed to make model request')
    }

    return modelResponse
  } catch (error) {
    console.error('Error:', error)
    return null
  }
}


/**
 * Fetch the final URL and make a HEAD request
 *
 * @param {string} jsonUrl - The URL to fetch the JSON from.
 * @param {string} etag_ - The ETag to use for the request.
 * @return {Promise<Response>} The response from the request.
 */
async function fetchAndHeadRequest(jsonUrl, etag_ = null) {
  try {
    const STATUS_NOT_MODIFIED = 304
    // Step 1: Fetch the JSON response with ETag header if provided
    const fetchOptions = etag_ ? {headers: {ETag: etag_}} : {}
    const proxyResponse = await fetch(jsonUrl, fetchOptions)

    if (proxyResponse.status === STATUS_NOT_MODIFIED) {
      console.warn('OPFS.worker#fetchAndHeadRequest: proxy responded HTTP_NOT_MODIFIED, using cached')
      return null
    }

    if (!proxyResponse.ok) {
      throw new Error('Failed to fetch JSON response')
    }

    // clone response
    const clonedResponse = proxyResponse.clone()

    const json = await clonedResponse.json()

    const {etag, finalURL} = json

    // Step 3: fetch model
    const modelResponse = await fetch(finalURL)

    if (!modelResponse.ok) {
      throw new Error('Failed to make model request')
    }

    return {proxyResponse, modelResponse, etag}
  } catch (error) {
    console.error('Error:', error)
  }
}


/**
 * Computes the Git blob SHA-1 hash for a given File.
 *
 * @param {FileSystemFileHandle} file - The File object to compute the SHA-1 hash for.
 * @return {Promise<string>} The computed SHA-1 hash in hexadecimal format.
 */
async function computeGitBlobSha1FromHandle(modelBlobFileHandle) {
  // Create FileSystemSyncAccessHandle on the file
  const blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()

  try {
      // Get the size of the file
      const fileSize = await blobAccessHandle.getSize()

      // Read the entire file into an ArrayBuffer
      const fileArrayBuffer = new ArrayBuffer(fileSize)
      await blobAccessHandle.read(fileArrayBuffer, {at: 0})

      // Create the Git blob header
      const header = `blob ${fileSize}\u0000`
      const headerBuffer = new TextEncoder().encode(header)

      // Create a new ArrayBuffer to hold the header and the file data
      const combinedBuffer = new Uint8Array(headerBuffer.byteLength + fileArrayBuffer.byteLength)

      // Copy the header and file data into the combined buffer
      combinedBuffer.set(headerBuffer, 0)
      combinedBuffer.set(new Uint8Array(fileArrayBuffer), headerBuffer.byteLength)

      // Compute the SHA-1 hash
      const hashBuffer = await crypto.subtle.digest('SHA-1', combinedBuffer)

      // Convert the hash to a hexadecimal string
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const HEX_IDENTIFIER = 16
      const hashHex = hashArray.map((b) => b.toString(HEX_IDENTIFIER).padStart(2, '0')).join('')

      return hashHex
  } finally {
      // Close the handle
      await blobAccessHandle.close()
  }
}


/**
 * Computes the Git blob SHA-1 hash for a given File.
 *
 * @param {File} file - The File object to compute the SHA-1 hash for.
 * @return {Promise<string>} The computed SHA-1 hash in hexadecimal format.
 */
async function computeGitBlobSha1FromFile(file) {
  // Get the size of the file
  const fileSize = file.size

  // Read the entire file into an ArrayBuffer
  const fileArrayBuffer = await file.arrayBuffer()

  // Create the Git blob header
  const header = `blob ${fileSize}\u0000`
  const headerBuffer = new TextEncoder().encode(header)

  // Create a new ArrayBuffer to hold the header and the file data
  const combinedBuffer = new Uint8Array(headerBuffer.byteLength + fileArrayBuffer.byteLength)

  // Copy the header and file data into the combined buffer
  combinedBuffer.set(headerBuffer, 0)
  combinedBuffer.set(new Uint8Array(fileArrayBuffer), headerBuffer.byteLength)

  // Compute the SHA-1 hash
  const hashBuffer = await crypto.subtle.digest('SHA-1', combinedBuffer)

  // Convert the hash to a hexadecimal string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const HEX_IDENTIFIER = 16
  const hashHex = hashArray.map((b) => b.toString(HEX_IDENTIFIER).padStart(2, '0')).join('')

  return hashHex
}


/**
 * Write temporary file to OPFS (Origin Private File System)
 *
 * @param {Response} response - The response from the request.
 * @param {string} originalFilePath - The path to the file.
 * @param {string} _etag - The ETag to use for the request.
 * @param {Function} onProgress - The function to call when the progress changes.
 * @return {Promise<[FileSystemDirectoryHandle, FileSystemFileHandle]>} The directory and file handles.
 */
async function writeTemporaryFileToOPFS(response, originalFilePath, _etag, onProgress) {
  const opfsRoot = await navigator.storage.getDirectory()
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null

  // lets see if our etag matches
  // Get file handle for file blob
  try {
    [modelDirectoryHandle, modelBlobFileHandle] = await
    retrieveFileWithPathNew(opfsRoot, originalFilePath, _etag, null, false)

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
    [modelDirectoryHandle, modelBlobFileHandle] = await writeFileToPath(opfsRoot, originalFilePath, _etag, null)
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
 * Write temporary file to OPFS (Origin Private File System)
 *
 * @param {Blob} blob - The blob to write to the file.
 * @param {string} originalFilePath - The path to the file.
 * @param {string} _etag - The ETag to use for the request.
 * @return {Promise<[FileSystemDirectoryHandle, FileSystemFileHandle]>} The directory and file handles.
 */
async function writeTemporaryBase64BlobFileToOPFS(blob, originalFilePath, _etag) {
  const opfsRoot = await navigator.storage.getDirectory()
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null

  // lets see if our etag matches
  // Get file handle for file blob
  try {
    [modelDirectoryHandle, modelBlobFileHandle] = await retrieveFileWithPathNew(opfsRoot, originalFilePath, _etag, null, false)

    if (modelBlobFileHandle !== null) {
      const blobFile = await modelBlobFileHandle.getFile()

      self.postMessage({completed: true, event: 'download', file: blobFile})
      return [modelDirectoryHandle, modelBlobFileHandle]
    }
  } catch (error) {
    // expected if file not found
  }
  let blobAccessHandle = null

  try {
    [modelDirectoryHandle, modelBlobFileHandle] = await writeFileToPath(opfsRoot, originalFilePath, _etag, null)
    // Create FileSystemSyncAccessHandle on the file.
    blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()
    // Write buffer
    const arrayBuffer = await blob.arrayBuffer()
    await blobAccessHandle.write(arrayBuffer, {at: 0})

    const blobFile = await modelBlobFileHandle.getFile()

    self.postMessage({completed: true, event: 'download', file: blobFile})

    return [modelDirectoryHandle, modelBlobFileHandle]
  } catch (error) {
    const workerMessage = `Error writing file handle for ${originalFilePath}: ${error}`
    // Close the access handle when done
    if (blobAccessHandle) {
      await blobAccessHandle.close()
    }
    self.postMessage({error: workerMessage})
  }
}


/**
 * Generates a mock HTTP Response object with a specified SHA hash header.
 *
 * @param {string} shaHash - The SHA hash value to include in the response headers.
 * @return {Response} A mock Response object with JSON content and specified headers.
 */
function generateMockResponse(shaHash) {
    // Mock response body data
  const mockBody = JSON.stringify({
    cached: false,
    etag: '"mockEtag"',
    finalURL: 'mockURL',
  })

  // Mock response headers
  const mockHeaders = new Headers({
    'Content-Type': 'application/json',
    'ETag': '"mockEtag"',
    'shahash': shaHash,
  })

  const HTTP_OK = 200
  // Create a mock Response object
  const mockResponse = new Response(mockBody, {
    status: HTTP_OK,
    statusText: 'OK',
    headers: mockHeaders,
  })

  return mockResponse
}


/**
 * @return {Blob} The Blob object created from the base64 string.
 */
function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)

  for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
  }

  return new Blob([bytes], {type: mimeType})
}


/**
 * Write base64 model to OPFS (Origin Private File System)
 *
 * @param {string} content - The content to write to the file.
 * @param {string} shaHash - The SHA hash to use for the request.
 * @param {string} originalFilePath - The path to the file.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The repository name.
 */
async function writeBase64Model(content, shaHash, originalFilePath, owner, repo, branch, accessToken) {
  let _etag = null
  let commitHash = null
  let cleanEtag = null
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null
  const opfsRoot = await navigator.storage.getDirectory()
  const cacheKey = `${owner}/${repo}/${branch}/${originalFilePath}`

  const cached = false // TODO- fix cache await Cache.checkCacheRaw(cacheKey)

  const cacheExist = cached && cached.headers


  if (cacheExist) {
    const clonedCached = cached.clone()
    // eslint-disable-next-line no-unused-vars
    const {_, etag, finalURL} = await clonedCached.json()
    _etag = etag

      // Remove any enclosing quotes from the ETag value
    cleanEtag = _etag.replace(/"/g, '')

    if (clonedCached.headers.get('commithash')) {
      commitHash = clonedCached.headers.get('commithash')
    }
  }

  if (shaHash) {
    try {
      [modelDirectoryHandle, modelBlobFileHandle] = await
      retrieveFileWithPathNew(opfsRoot, cacheKey, shaHash, commitHash, false)

      if (modelBlobFileHandle === null) {
        // couldn't find via shaHash or commitHash, see if we have an unauthed etag
        if (cleanEtag) {
          [modelDirectoryHandle, modelBlobFileHandle] = await
          retrieveFileWithPathNew(opfsRoot, cacheKey, cleanEtag, null, false)
        }
      }

      if (modelBlobFileHandle !== null ) {
        // Display model
        const blobFile = await modelBlobFileHandle.getFile()

        self.postMessage({completed: true, event: (commitHash === null ) ? 'download' : 'exists', file: blobFile})

        if (commitHash !== null) {
          return
        }
        // get commit hash
        const _commitHash = await fetchLatestCommitHash(GITHUB_BASE_URL_AUTHENTICATED, owner, repo, originalFilePath, accessToken, branch)

        if (_commitHash !== null) {
          const pathSegments = safePathSplit(originalFilePath)
          const lastSegment = pathSegments[pathSegments.length - 1]
          const newFileName = `${lastSegment}.${shaHash}.${_commitHash}`
          const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

          if (newResult !== null) {
            const mockResponse = generateMockResponse(shaHash)
            // Update cache with new data
            await Cache.updateCacheRaw(cacheKey, mockResponse, _commitHash)
            const updatedBlobFile = await newResult.getFile()

            self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
          }
        }
      } else {
        // we don't have it stored and need to decode the base64 blob to file and write to OPFS
        const blob = base64ToBlob(content)

        if (blob !== null) {
          [modelDirectoryHandle, modelBlobFileHandle] = await writeTemporaryBase64BlobFileToOPFS(blob, cacheKey, shaHash)

          const mockResponse = generateMockResponse(shaHash)

          await Cache.updateCacheRaw(cacheKey, mockResponse, null)

          // get commit hash
          const _commitHash = await fetchLatestCommitHash(GITHUB_BASE_URL_AUTHENTICATED, owner, repo, originalFilePath, accessToken, branch)

          if (_commitHash !== null) {
            const pathSegments = safePathSplit(originalFilePath)
            const lastSegment = pathSegments[pathSegments.length - 1]
            const newFileName = `${lastSegment}.${shaHash}.${_commitHash}`
            const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

            if (newResult !== null) {
              // Update cache with new data
              const clonedResponse = generateMockResponse(shaHash)
              await Cache.updateCacheRaw(cacheKey, clonedResponse, _commitHash)
              const updatedBlobFile = await newResult.getFile()

              self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
            }
          }
        }
      }
    } catch (error) {
      const workerMessage = `Error writing base64 model for ${cacheKey}: ${error}`
      self.postMessage({error: workerMessage})
    }
  }
}


/**
 * Download model to OPFS (Origin Private File System)
 *
 * @param {string} objectUrl - The URL to fetch the model from.
 * @param {string} shaHash - The SHA hash to use for the request.
 * @param {string} originalFilePath - The path to the file.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The repository name.
 * @param {string} branch - The branch to fetch the latest commit hash from.
 * @param {string} accessToken - The access token to use for the request.
 * @param {Function} onProgress - The function to call when the progress changes.
 * @return {Promise<void>}
 */
async function downloadModel(objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, onProgress) {
  let _etag = null
  let commitHash = null
  let cleanEtag = null
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null
  const opfsRoot = await navigator.storage.getDirectory()
  const cacheKey = `${owner}/${repo}/${branch}/${originalFilePath}`

  const cached = false // TODO- fix cacheawait Cache.checkCacheRaw(cacheKey)

  const cacheExist = cached && cached.headers


  if (cacheExist) {
    const clonedCached = cached.clone()
    // eslint-disable-next-line no-unused-vars
    const {_, etag, finalURL} = await clonedCached.json()
    _etag = etag

      // Remove any enclosing quotes from the ETag value
    cleanEtag = _etag.replace(/"/g, '')

    if (clonedCached.headers.get('commithash')) {
      commitHash = clonedCached.headers.get('commithash')
    }
  }

  if (shaHash) {
    // This will be the authed case - in this case we don't use the proxy at all.
    // For this we just see if the either GIT SHA or the commit hash exists in a file name in OPFS.
    // If the file exists in cache it should have a commit hash already.
    // TODO: There is a race condition where someone can load a file unauthed and log in and refresh
    // the page before the file is renamed with the commit hash. This would cause a duplicate file
    // to be stored in OPFS

    try {
      [modelDirectoryHandle, modelBlobFileHandle] = await
      retrieveFileWithPathNew(opfsRoot, cacheKey, shaHash, commitHash, false)

      if (modelBlobFileHandle === null) {
        // couldn't find via shaHash or commitHash, see if we have an unauthed etag
        if (cleanEtag) {
          [modelDirectoryHandle, modelBlobFileHandle] = await
          retrieveFileWithPathNew(opfsRoot, cacheKey, cleanEtag, null, false)
        }
      }

      if (modelBlobFileHandle !== null ) {
        // Display model
        const blobFile = await modelBlobFileHandle.getFile()

        self.postMessage({completed: true, event: (commitHash === null ) ? 'download' : 'exists', file: blobFile})

        if (commitHash !== null) {
          return
        }
        // get commit hash
        const _commitHash = await fetchLatestCommitHash(GITHUB_BASE_URL_AUTHENTICATED, owner, repo, originalFilePath, accessToken, branch)

        if (_commitHash !== null) {
          const pathSegments = safePathSplit(originalFilePath)
          const lastSegment = pathSegments[pathSegments.length - 1]
          const newFileName = `${lastSegment}.${shaHash}.${_commitHash}`
          const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

          if (newResult !== null) {
            const mockResponse = generateMockResponse(shaHash)
            // Update cache with new data
            await Cache.updateCacheRaw(cacheKey, mockResponse, _commitHash)
            const updatedBlobFile = await newResult.getFile()

            self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
          }
        }
      } else {
        // we don't have it and need to fetch
        const result = await fetchRGHUC(objectUrl)

        if (result !== null) {
          [modelDirectoryHandle, modelBlobFileHandle] = await writeTemporaryFileToOPFS(result, cacheKey, shaHash, onProgress)

          const mockResponse = generateMockResponse(shaHash)

          await Cache.updateCacheRaw(cacheKey, mockResponse, null)

          // get commit hash
          const _commitHash = await fetchLatestCommitHash(GITHUB_BASE_URL_AUTHENTICATED, owner, repo, originalFilePath, accessToken, branch)

          if (_commitHash !== null) {
            const pathSegments = safePathSplit(originalFilePath)
            const lastSegment = pathSegments[pathSegments.length - 1]
            const newFileName = `${lastSegment}.${shaHash}.${_commitHash}`
            const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

            if (newResult !== null) {
              // Update cache with new data
              const clonedResponse = generateMockResponse(shaHash)
              await Cache.updateCacheRaw(cacheKey, clonedResponse, _commitHash)
              const updatedBlobFile = await newResult.getFile()

              self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
              return
            }
          }
        }
      }
    } catch (error) {
      return
    }

    return
  }

  // const etag = "\"d3796370c5691ef25bbc6e829194623e4a2521a78092fa3abec23c0e8fe34e1a\""
  const result = await fetchAndHeadRequest(objectUrl, _etag)

  if (result === null) {
    // result SHOULD be cached, let's see.
    try {
      [modelDirectoryHandle, modelBlobFileHandle] = await
      retrieveFileWithPathNew(opfsRoot, cacheKey, cleanEtag, commitHash === null ? 'temporary' : commitHash, false)

      if (modelBlobFileHandle !== null ) {
        // Display model
        const blobFile = await modelBlobFileHandle.getFile()

        self.postMessage({completed: true, event: (commitHash === null ) ? 'download' : 'exists', file: blobFile})

        if (commitHash !== null) {
          return
        }
        // TODO: get commit hash
        const _commitHash = await fetchLatestCommitHash(GITHUB_BASE_URL_UNAUTHENTICATED, owner, repo, originalFilePath, accessToken, branch)

        if (_commitHash !== null) {
          const pathSegments = safePathSplit(originalFilePath)
          const lastSegment = pathSegments[pathSegments.length - 1]
          const newFileName = `${lastSegment }.${cleanEtag}.${ _commitHash === null ? 'temporary' : _commitHash}`
          const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

          if (newResult !== null) {
            // Update cache with new data
            await Cache.updateCacheRaw(cacheKey, proxyResponse, _commitHash)
            const updatedBlobFile = await newResult.getFile()

            self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
          }
        }
      } else {
        // expected if file not found - lets see if we have a temporary file

        if (commitHash !== null) {
          try {
            [modelDirectoryHandle, modelBlobFileHandle] = await
            retrieveFileWithPathNew(opfsRoot, cacheKey, cleanEtag, 'temporary', false)

            if (modelBlobFileHandle !== null ) {
              // Display model and get commitHash
              const blobFile = await modelBlobFileHandle.getFile()

              self.postMessage({completed: true, event: 'download', file: blobFile})

              // TODO: get commit hash here
              const _commitHash = await fetchLatestCommitHash(
                GITHUB_BASE_URL_UNAUTHENTICATED,
                owner,
                repo,
                originalFilePath,
                accessToken,
                branch)

              if (_commitHash !== null) {
                const pathSegments = safePathSplit(originalFilePath)
                const lastSegment = pathSegments[pathSegments.length - 1]
                const newFileName = `${lastSegment }.${cleanEtag}.${ _commitHash === null ? 'temporary' : _commitHash}`
                const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

                if (newResult !== null) {
                  // Update cache with new data
                  await Cache.updateCacheRaw(cacheKey, proxyResponse, _commitHash)
                  const updatedBlobFile = await newResult.getFile()

                  self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
                }
              }
            }
          } catch (error_) {
            // expected if file not found - invalidate cache and try again
            console.warn('File not found in cache, invalidating cache and request again with no etag')
            await Cache.deleteCache(cacheKey)
            downloadModel(objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, onProgress)
            return
          }
        }

        console.warn('File not found in cache, invalidating cache and request again with no etag')
        await Cache.deleteCache(cacheKey)
        downloadModel(objectUrl, shaHash, originalFilePath, owner, repo, branch, accessToken, onProgress)
        return
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.trace(error)
    }
  }

  // not cached, download model
  const {proxyResponse, modelResponse, etag} = result

   // Remove any enclosing quotes from the ETag value
   cleanEtag = etag.replace(/"/g, '');

  [modelDirectoryHandle, modelBlobFileHandle] = await writeTemporaryFileToOPFS(modelResponse, cacheKey, cleanEtag, onProgress)

  // Compute file git sha1 hash
  const computedShaHash = await computeGitBlobSha1FromHandle(modelBlobFileHandle)
  // eslint-disable-next-line no-console
  console.log('SHA-1 Hash:', computedShaHash)

  try {
    // eslint-disable-next-line no-unused-vars
    const [modelDirectoryHandle_, modelBlobFileHandle_] = await
        retrieveFileWithPathNew(opfsRoot, cacheKey, computedShaHash, null, false)

      if (modelBlobFileHandle_ !== null) {
        // eslint-disable-next-line no-console
        console.log('SHA match found in OPFS')
        // we already have this file, just delete the one we downloaded and update the cached response.
        const newResponse = proxyResponse.clone()
        await Cache.updateCacheRaw(cacheKey, newResponse, commitHash)
        modelDirectoryHandle.removeEntry(modelBlobFileHandle.name)
        return
      }
  } catch (error_) {
    return
  }


  // Update cache with new data
  const clonedResponse = proxyResponse.clone()
  await Cache.updateCacheRaw(cacheKey, clonedResponse, null)

  // TODO: get commit hash
  const _commitHash = await fetchLatestCommitHash(GITHUB_BASE_URL_UNAUTHENTICATED, owner, repo, originalFilePath, accessToken, branch)

  if (_commitHash !== null) {
    const pathSegments = safePathSplit(originalFilePath)
    const lastSegment = pathSegments[pathSegments.length - 1]
    const newFileName = `${lastSegment }.${cleanEtag}.${ _commitHash === null ? 'temporary' : _commitHash}`
    const newResult = await renameFileInOPFS(modelDirectoryHandle, modelBlobFileHandle, newFileName)

    if (newResult !== null) {
      // Update cache with new data
      await Cache.updateCacheRaw(cacheKey, proxyResponse, _commitHash)
      const updatedBlobFile = await newResult.getFile()

      self.postMessage({completed: true, event: 'renamed', file: updatedBlobFile})
    }
  }
}


/**
 * Retrieve file with path
 *
 * @param {FileSystemDirectoryHandle} rootHandle - The root directory handle.
 * @param {string} filePath - The path to the file.
 * @param {string} commitHash - The commit hash to use for the request.
 * @param {boolean} shouldCreate - Whether to create the file if it doesn't exist.
 * @return {Promise<[FileSystemDirectoryHandle, FileSystemFileHandle]>} The directory and file handles.
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
  const pathSegments = safePathSplit(originalFilePath)
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
 * Write file to path
 *
 * @param {FileSystemDirectoryHandle} rootHandle - The root directory handle.
 * @param {string} filePath - The path to the file.
 * @param {string} etag - The ETag to use for the request.
 * @param {string} commitHash - The commit hash to use for the request.
 * @return {Promise<[FileSystemDirectoryHandle, FileSystemFileHandle]>} The directory and file handles.
 */
async function writeFileToPath(rootHandle, filePath, etag, commitHash = null) {
  const pathSegments = safePathSplit(filePath)
  let currentHandle = rootHandle

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]
    const isLastSegment = i === pathSegments.length - 1

    if (!isLastSegment) {
      // Try to get the directory handle; if it doesn't exist, create it
      try {
        currentHandle = await currentHandle.getDirectoryHandle(segment, {create: true})
      } catch (error) {
        const workerMessage = `Error getting/creating directory handle for segment(${segment}): ${error}.`
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
        const workerMessage = `Error getting/creating file handle for file(${segment}): ${error}.`
        self.postMessage({error: workerMessage})
        return null
      }
    }
  }
}


/**
 * Retrieve file with path
 *
 * @param {FileSystemDirectoryHandle} rootHandle - The root directory handle.
 * @param {string} filePath - The path to the file.
 * @param {string} commitHash - The commit hash to use for the request.
 * @param {boolean} shouldCreate - Whether to create the file if it doesn't exist.
 * @return {Promise<[FileSystemDirectoryHandle, FileSystemFileHandle]>} The directory and file handles.
 */
async function retrieveFileWithPath(rootHandle, filePath, commitHash, shouldCreate = true) {
  const pathSegments = safePathSplit(filePath)
  let currentHandle = rootHandle

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]
    const isLastSegment = i === pathSegments.length - 1

    if (!isLastSegment) {
      // Try to get the directory handle; if it doesn't exist, create it
      try {
        currentHandle = await currentHandle.getDirectoryHandle(segment, {create: true})
      } catch (error) {
        const workerMessage = `Error getting/creating directory handle for segment(${segment}): ${error}.`
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
        const workerMessage = `Error getting/creating file handle for file(${segment}): ${error}.`
        self.postMessage({error: workerMessage})
        return null
      }
    }
  }
}

/**
 * Retrieve file with path
 *
 * @param {FileSystemDirectoryHandle} rootHandle - The root directory handle.
 * @param {string} filePath - The path to the file.
 * @param {string} etag - The ETag to use for the request.
 * @param {string} commitHash - The commit hash to use for the request.
 * @param {boolean} create - Whether to create the file if it doesn't exist.
 * @return {Promise<[FileSystemDirectoryHandle, FileSystemFileHandle]>} The directory and file handles.
 */
async function retrieveFileWithPathNew(rootHandle, filePath, etag, commitHash, create = false) {
  const pathSegments = safePathSplit(filePath)
  let currentHandle = rootHandle

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]
    const isLastSegment = i === pathSegments.length - 1

    if (!isLastSegment) {
      // Try to get the directory handle; if it doesn't exist, create it
      try {
        currentHandle = await currentHandle.getDirectoryHandle(segment, {create: true})
      } catch (error) {
        const workerMessage = `Error getting/creating directory handle for segment(${segment}): ${error}.`
        self.postMessage({error: workerMessage})
        return [null, null]
      }
    } else {
      // Last segment, treat it as a file
      try {
        if (create) {
          // If no matching file is found, create a new file handle
          const fileHandle = await currentHandle.getFileHandle(
            `${segment}.${etag}.${commitHash === null ? 'temporary' : commitHash}`,
            {create: create},
          )
          return [currentHandle, fileHandle] // Return the new file handle
        }

        // Search for any file in the directory that contains either the etag or commitHash
        for await (const [name, handle] of currentHandle.entries()) {
          if (handle.kind === 'file' && (name.includes(etag) ||
           (commitHash !== null && name.includes(commitHash) && name.startsWith(segment)))) {
            return [currentHandle, handle] // Return the handle of the matching file
          }
        }

        return [null, null]
      } catch (error) {
        return [null, null]
      }
    }
  }
}

/**
 * Write file to handle
 *
 * @param {FileSystemSyncAccessHandle} blobAccessHandle - The blob access handle.
 * @param {File} modelFile - The model file.
 * @return {Promise<boolean>} True if the file was written successfully, false otherwise.
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
 * Write model to OPFS from file
 *
 * @param {File} modelFile - The model file.
 * @param {string} objectKey - The object key to use for the request.
 * @param {string} originalFilePath - The path to the file.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The repository name.
 */
async function writeModelToOPFSFromFile(modelFile, objectKey, originalFilePath, owner, repo, branch) {
  const opfsRoot = await navigator.storage.getDirectory()

  // Compute file git sha1 hash
  const computedShaHash = await computeGitBlobSha1FromFile(modelFile)
  // eslint-disable-next-line no-console
  console.log('SHA-1 Hash:', computedShaHash)

  // Get a file handle in the folder for the model
  let blobAccessHandle = null

  const cacheKey = `${owner}/${repo}/${branch}/${originalFilePath}`
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null

  try {
    // eslint-disable-next-line no-unused-vars
    [modelDirectoryHandle, modelBlobFileHandle] = await
    retrieveFileWithPathNew(opfsRoot, cacheKey, computedShaHash, objectKey, true)
    // Create FileSystemSyncAccessHandle on the file.
    blobAccessHandle = await modelBlobFileHandle.createSyncAccessHandle()

    if (await writeFileToHandle(blobAccessHandle, modelFile)) {
      // Update cache with new data
      const mockResponse = generateMockResponse(computedShaHash)
      await Cache.updateCacheRaw(cacheKey, mockResponse, objectKey)
      self.postMessage({completed: true, event: 'write'})
    }
  } catch (error) {
    const workerMessage = `Error getting file handle for ${originalFilePath}: ${error}`
    self.postMessage({error: workerMessage})
  }
}


/**
 * Rename file in OPFS
 *
 * @param {FileSystemDirectoryHandle} parentDirectory - The parent directory handle.
 * @param {FileSystemFileHandle} fileHandle - The file handle to rename.
 * @param {string} newFileName - The new file name.
 * @return {Promise<FileSystemFileHandle>} The new file handle.
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
  const cacheKey = `${owner}/${repo}/${branch}/${originalFilePath}`
  let modelDirectoryHandle = null
  let modelBlobFileHandle = null;

  // eslint-disable-next-line no-unused-vars
  [modelDirectoryHandle, modelBlobFileHandle] = await retrieveFileWithPathNew(
    opfsRoot, cacheKey, null, commitHash, false,
  )

  if (modelBlobFileHandle !== null ) {
    self.postMessage({completed: true, event: 'exist', commitHash: commitHash})
  } else {
    self.postMessage({completed: true, event: 'notexist', commitHash: commitHash})
  }
}


/**
 * This function navigates to the model location in OPFS and deletes it.
 * If any parent folders or the file do not exist, it will return 'notexist'.
 * If it successfully deletes the file, it will return 'deleted'.
 *
 * @param {string} commitHash - The commit hash to use for the request.
 * @param {string} originalFilePath - The path to the file.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The repository name.
 * @param {string} branch - The branch to use for the request.
 * @return {Promise<void>}
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
  const pathSegments = safePathSplit(originalFilePath)
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
 * Write model to OPFS
 *
 * @param {string} objectUrl - The URL to fetch the model from.
 * @param {string} objectKey - The object key to use for the request.
 * @param {string} originalFileName - The name of the original file.
 * @return {Promise<void>}
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
 * Read model from OPFS
 *
 * @param {string} objectKey - The object key to use for the request.
 * @return {Promise<void>}
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
 * Write file to OPFS
 *
 * @param {string} objectUrl - The URL to fetch the file from.
 * @param {string} fileName - The name of the file.
 * @return {Promise<void>}
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
 * Read file from OPFS
 *
 * @param {string} fileName - The name of the file.
 * @return {Promise<void>}
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
 * @param {{[key: string]: any}} obj Variable length arguments to assert are defined.
 * @param {Array<string>} keys That was passed in
 * @return {{[key: string]: any}} obj That object that was passed in, if valid
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


/**
 * Split str on / and remove empty string as first or last array elt if they are
 * present.
 *
 * @param {string} pathStr - The path to split.
 * @return {string[]} The path segments.
 */
function safePathSplit(pathStr) {
  const parts = pathStr.split('/')
  if (parts[0] === '') {
    parts.shift()
  }
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop()
  }
  return parts
}

// Export functions when running under Node (e.g. for Jest tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    snapshotCache,
    traverseDirectory,
    clearCache,
    deleteAllEntries,
    fetchLatestCommitHash,
    fetchRGHUC,
    fetchAndHeadRequest,
    computeGitBlobSha1FromHandle,
    computeGitBlobSha1FromFile,
    writeTemporaryFileToOPFS,
    writeTemporaryBase64BlobFileToOPFS,
    generateMockResponse,
    base64ToBlob,
    writeBase64Model,
    downloadModel,
    downloadModelToOPFS,
    writeFileToPath,
    retrieveFileWithPath,
    retrieveFileWithPathNew,
    writeFileToHandle,
    writeModelToOPFSFromFile,
    renameFileInOPFS,
    doesFileExistInOPFS,
    deleteModelFromOPFS,
    writeModelToOPFS,
    readModelFromOPFS,
    writeFileToOPFS,
    readFileFromOPFS,
    assertValues,
    safePathSplit,
  }
}


class GeometryConvertor {
  constructor(wasmModule) {
    this.wasmModule = wasmModule
  }

  // async generator so callers can `for await (...)`
  async* toGltfs(geometryPtr, materialsPtr, chunks, isGlb, outputDraco, fileUri) {
    if (!this.wasmModule) {
return
}

    let currentChunkIndex = 0
    const chunkCount = chunks?.length ?? 0
    const chunkDigits = String(Math.max(1, chunkCount)).length

    for (const chunk of chunks) {
      const chunkUri = chunkCount > 0 ?
        `${fileUri}${String(currentChunkIndex).padStart(chunkDigits, '0')}` :
        fileUri

      // Works whether toGltf is sync or async
      const res = await Promise.resolve(
        this.toGltf(
          geometryPtr,
          materialsPtr,
          isGlb,
          false,
          chunkUri,
          chunk.offset,
          chunk.count,
        ),
      )

      yield res
      currentChunkIndex++
    }
  }

  toGltf(geometry, materials, isGlb, outputDraco, fileUri, geometryOffset = 0, geometryCount /* don’t default: ptrs don’t have size() */) {
    const noResults = {success: false, bufferUris: undefined, buffers: undefined}
    if (!this.wasmModule) {
return noResults
}

    return this.wasmModule.geometryToGltfPtr(
      geometry,
      materials,
      isGlb,
      outputDraco,
      fileUri,
      geometryOffset,
      geometryCount,
    )
  }
}
