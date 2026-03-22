/**
 * Lightweight OPFS operations for project-managed model files.
 *
 * Uses the File System Access API directly on the main thread.
 * Separate from the existing OPFS worker which is coupled to GitHub metadata.
 *
 * Directory structure:
 *   OPFS root / bldrs-projects / {projectId} / {modelId} / v{N}.{ext}
 */


const ROOT_DIR = 'bldrs-projects'


async function getRoot(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory()
  return opfsRoot.getDirectoryHandle(ROOT_DIR, {create: true})
}


function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.substring(dot) : '.ifc'
}


/**
 * Write a file into the project OPFS directory.
 * Returns the opfsPath string for storage in IndexedDB.
 */
export async function writeProjectFile(
  projectId: string,
  modelId: string,
  versionNumber: number,
  file: File,
): Promise<string> {
  const root = await getRoot()
  const projectDir = await root.getDirectoryHandle(projectId, {create: true})
  const modelDir = await projectDir.getDirectoryHandle(modelId, {create: true})

  const ext = getExtension(file.name)
  const fileName = `v${versionNumber}${ext}`

  const fileHandle = await modelDir.getFileHandle(fileName, {create: true})
  const writable = await fileHandle.createWritable()
  await writable.write(await file.arrayBuffer())
  await writable.close()

  return `${ROOT_DIR}/${projectId}/${modelId}/${fileName}`
}


/**
 * Read a file from the project OPFS directory.
 */
export async function readProjectFile(opfsPath: string): Promise<File> {
  const parts = opfsPath.split('/')
  // parts: ['bldrs-projects', projectId, modelId, fileName]
  const opfsRoot = await navigator.storage.getDirectory()
  let dir: FileSystemDirectoryHandle = opfsRoot
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i])
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1])
  return fileHandle.getFile()
}


/**
 * Delete a single version file from OPFS.
 */
export async function deleteProjectFile(opfsPath: string): Promise<void> {
  try {
    const parts = opfsPath.split('/')
    const opfsRoot = await navigator.storage.getDirectory()
    let dir: FileSystemDirectoryHandle = opfsRoot
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i])
    }
    await dir.removeEntry(parts[parts.length - 1])
  } catch {
    // File may already be deleted
  }
}


/**
 * Delete an entire model directory (all versions).
 */
export async function deleteModelDirectory(
  projectId: string,
  modelId: string,
): Promise<void> {
  try {
    const root = await getRoot()
    const projectDir = await root.getDirectoryHandle(projectId)
    await projectDir.removeEntry(modelId, {recursive: true})
  } catch {
    // Directory may not exist
  }
}


/**
 * Delete an entire project directory.
 */
export async function deleteProjectDirectory(projectId: string): Promise<void> {
  try {
    const root = await getRoot()
    await root.removeEntry(projectId, {recursive: true})
  } catch {
    // Directory may not exist
  }
}


/**
 * Compute SHA-256 hash of a file. Returns hex string.
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
