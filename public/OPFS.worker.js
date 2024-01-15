// opfsWorker.js

self.addEventListener('message', async (event) => {
  try {
    if (event.data.command === 'writeObjectURLToFile') {
      try {
        const objectUrl = event.data.objectUrl
        const fileName = event.data.fileName
        const opfsRoot = await navigator.storage.getDirectory()

        // Try to access an existing file
        let newFileHandle = null

        // Get file handle
        try {
          newFileHandle = await opfsRoot.getFileHandle(fileName, {create: true})
        } catch (error) {
          const workerMessage = `Error getting file handle for ${fileName}:${error}`
          self.postMessage({error: workerMessage})
          return
        }

        // Fetch the file from the object URL
        const response = await fetch(objectUrl)
        const fileBuffer = await response.blob() // Convert the response to a blob, which is a File-like object

        const fileArrayBufer = await fileBuffer.arrayBuffer()


        try {
          // Create FileSystemSyncAccessHandle on the file.
          const accessHandle = await newFileHandle.createSyncAccessHandle()

          // Write buffer at the end of the file
          const writeSize = accessHandle.write(fileArrayBufer, {at: 0})
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
        const workerMessage = `Error writing object URL to file:${ error}`
        self.postMessage({error: workerMessage})
        return
      }
    } else if (event.data.command === 'readObjectFromStorage') {
      try {
        const fileName = event.data.fileName
        const opfsRoot = await navigator.storage.getDirectory()

        // Try to access an existing file
        let newFileHandle
        try {
          newFileHandle = await opfsRoot.getFileHandle(fileName)
        } catch (error) {
          const errorMessage = `File ${fileName} not found.`
          self.postMessage({error: errorMessage})
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
        return
      }
    }
  } catch (error) {
    self.postMessage({error: error.message})
  }
})
