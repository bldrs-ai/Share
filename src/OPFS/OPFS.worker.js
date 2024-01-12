// opfsWorker.js

self.addEventListener('message', async (event) => {
    try {
        // Depending on the message, you can handle different OPFS operations
        if (event.data.command === 'accessOPFS') {
            try {
                try {
                    const opfsRoot = await navigator.storage.getDirectory();

                    // Try to access an existing file
                    let existingFileHandle;
                    try {
                        existingFileHandle = await opfsRoot.getFileHandle("testFile");
                    } catch (error) {
                        console.log("File 'testFile' not found, creating new file.");
                        existingFileHandle = await opfsRoot.getFileHandle("testFile", { create: true });
                    }

                    // Try to access an existing directory
                    let existingDirectoryHandle;
                    try {
                        existingDirectoryHandle = await opfsRoot.getDirectoryHandle("testFolder");
                    } catch (error) {
                        console.log("Directory 'testFolder' not found, creating new directory.");
                        existingDirectoryHandle = await opfsRoot.getDirectoryHandle("testFolder", { create: true });
                    }

                    //write to file 
                    // create a FileSystemWritableFileStream to write to
                    try {
                        console.log("Writing \"Hello, World!\" to testFile...")
                        // Create FileSystemSyncAccessHandle on the file.
                        const accessHandle = await existingFileHandle.createSyncAccessHandle()

                        const encoder = new TextEncoder();
                        const writeBuffer = encoder.encode("Hello World!");
                        // Write buffer at the end of the file
                        const writeSize = accessHandle.write(writeBuffer, { at: 0 });
                        // Close the access handle when done
                        await accessHandle.close();

                    } catch (error) {
                        console.log(`Error writing to testFile: ${error}.`);
                    }

                    //try reading from file 
                    try {
                        const file = await existingFileHandle.getFile()
                        const testBlobStr = await file.text()
                        console.log(`testFile contents: ${testBlobStr}`)
                    } catch (error) {
                        console.log(`Error reading from testFile: ${error}.`);
                    }

                    //delete file and folder 
                    console.log("deleting testFile")
                    opfsRoot.removeEntry("testFile")

                    try {
                        existingFileHandle = await opfsRoot.getFileHandle("testFile");
                    } catch (error) {
                        console.log("testFile deleted.");
                    }

                    console.log("deleting testFolder...")
                    opfsRoot.removeEntry("testFolder")

                    try {
                        existingDirectoryHandle = await opfsRoot.getDirectoryHandle("testFolder");
                    } catch (error) {
                        console.log("testFolder deleted.");
                    }

                } catch (error) {
                    console.error("Error accessing OPFS:", error);
                }
            } catch (error) {
                console.error("Error creating file:", error);
            }
        }

        else if (event.data.command === 'writeObjectURLToFile') {
            try {
                const objectUrl = event.data.objectUrl;
                const fileName = event.data.fileName;
                const opfsRoot = await navigator.storage.getDirectory();

                // Try to access an existing file
                let existingFileHandle;
                try {
                    existingFileHandle = await opfsRoot.getFileHandle(fileName);
                } catch (error) {
                    console.log(`File ${fileName} not found, creating new file.`);
                }

                // Get file handle
                try {
                    existingFileHandle = await opfsRoot.getFileHandle(fileName, { create: true });
                } catch (error) {
                    console.error(`Error getting file handle for ${fileName}:`, error);
                    return;
                }

                // Fetch the file from the object URL
                const response = await fetch(objectUrl);
                const fileBuffer = await response.blob(); // Convert the response to a blob, which is a File-like object

                const fileArrayBufer = await fileBuffer.arrayBuffer();


                try {
                    console.log(`Writing model contents to ${fileName}...`)

                    // Create FileSystemSyncAccessHandle on the file.
                    const accessHandle = await existingFileHandle.createSyncAccessHandle()

                    // Write buffer at the end of the file
                    const writeSize = accessHandle.write(fileArrayBufer, { at: 0 });
                    // Close the access handle when done
                    await accessHandle.close();

                    if (writeSize > 0) {
                    console.log(`${fileName} written successfully.`);

                    self.postMessage({completed: true, fileName: fileName});

                    } else {
                        const workerMessage = "Error writing to file: " + fileName;
                        console.log(workerMessage);
                        self.postMessage({error: workerMessage})
                    }

                } catch (error) {
                    console.log(`Error writing to ${fileName}: ${error}.`);
                }
            } catch (error) {
                console.error("Error writing object URL to file:", error);
            }
        }
    } catch (error) {
        self.postMessage({ error: error.message });
    }
});
