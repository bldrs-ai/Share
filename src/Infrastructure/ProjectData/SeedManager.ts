/**
 * Seed data manager — export project data to files, import from seed.json on startup.
 *
 * Export: reads IndexedDB + OPFS → produces seed.json + model files (download as zip or save to disk)
 * Import: fetches seed.json from server → imports into IndexedDB + OPFS if not already present
 */

import {
  Company,
  Project,
  ModelRef,
  ModelVersion,
  ProjectRepository,
} from './types'
import {readProjectFile, writeProjectFile} from './ProjectFileStore'


declare global {
  interface Window { __ASSET_BASE__?: string }
}


const SEED_IMPORTED_KEY = 'bldrs-seed-imported'


// ── Seed JSON structure ──

export interface SeedData {
  companies: Company[]
  projects: Project[]
  models: ModelRef[]
  versions: (ModelVersion & { seedFilePath: string })[]
}


// ── Export ──

/**
 * Export all project data from IndexedDB + OPFS as a downloadable zip.
 * Uses JSZip-free approach: creates individual file downloads or a combined JSON.
 */
export async function exportSeedData(repo: ProjectRepository): Promise<{
  seedJson: string
  modelFiles: { name: string; file: File }[]
}> {
  const companies = await repo.listCompanies()
  const allProjects: Project[] = []
  const allModels: ModelRef[] = []
  const allVersions: (ModelVersion & { seedFilePath: string })[] = []
  const modelFiles: { name: string; file: File }[] = []

  for (const company of companies) {
    const projects = await repo.listProjects(company.id)
    allProjects.push(...projects)

    for (const project of projects) {
      const models = await repo.listModels(project.id)
      allModels.push(...models)

      for (const model of models) {
        const versions = await repo.listVersions(model.id)
        for (const version of versions) {
          const seedFilePath = `models/${version.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          allVersions.push({...version, seedFilePath})

          try {
            const file = await readProjectFile(version.opfsPath)
            modelFiles.push({name: seedFilePath, file})
          } catch (err) {
            console.warn(`[SeedManager] Could not read file for version ${version.id}:`, err)
          }
        }
      }
    }
  }

  const seed: SeedData = {
    companies,
    projects: allProjects,
    models: allModels,
    versions: allVersions,
  }

  return {
    seedJson: JSON.stringify(seed, null, 2),
    modelFiles,
  }
}


const EXPORT_DIR_HANDLE_DB = 'bldrs-export-dir'
const EXPORT_DIR_HANDLE_STORE = 'handle'
const EXPORT_DIR_HANDLE_KEY = 'projectsDir'


/**
 * Save/retrieve the export directory handle from IndexedDB so the user
 * only needs to pick the folder once.
 */
async function getSavedDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(EXPORT_DIR_HANDLE_DB, 1)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(EXPORT_DIR_HANDLE_STORE)) {
        db.createObjectStore(EXPORT_DIR_HANDLE_STORE)
      }
    }
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      const tx = db.transaction(EXPORT_DIR_HANDLE_STORE, 'readonly')
      const store = tx.objectStore(EXPORT_DIR_HANDLE_STORE)
      const getReq = store.get(EXPORT_DIR_HANDLE_KEY)
      getReq.onsuccess = () => resolve(getReq.result || null)
      getReq.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
}

async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(EXPORT_DIR_HANDLE_DB, 1)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(EXPORT_DIR_HANDLE_STORE)) {
        db.createObjectStore(EXPORT_DIR_HANDLE_STORE)
      }
    }
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      const tx = db.transaction(EXPORT_DIR_HANDLE_STORE, 'readwrite')
      tx.objectStore(EXPORT_DIR_HANDLE_STORE).put(handle, EXPORT_DIR_HANDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    }
    req.onerror = () => resolve()
  })
}


/**
 * Save seed data to the local projects directory.
 * First time: opens directory picker. Subsequent saves: reuses the saved handle.
 */
export async function exportToDirectory(repo: ProjectRepository): Promise<void> {
  const {seedJson, modelFiles} = await exportSeedData(repo)

  // Try to reuse saved directory handle
  let dirHandle = await getSavedDirHandle()
  if (dirHandle) {
    // Verify we still have permission
    const perm = await (dirHandle as any).queryPermission({mode: 'readwrite'})
    if (perm !== 'granted') {
      const req = await (dirHandle as any).requestPermission({mode: 'readwrite'})
      if (req !== 'granted') dirHandle = null
    }
  }

  // If no saved handle or permission denied, ask the user to pick
  if (!dirHandle) {
    dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      id: 'bldrs-projects-export',
    })
    await saveDirHandle(dirHandle)
  }

  // Write seed.json
  const seedHandle = await dirHandle!.getFileHandle('seed.json', {create: true})
  const seedWritable = await (seedHandle as any).createWritable()
  await seedWritable.write(seedJson)
  await seedWritable.close()

  // Create models/ directory and write files
  if (modelFiles.length > 0) {
    const modelsDir = await dirHandle!.getDirectoryHandle('models', {create: true})
    for (const {name, file} of modelFiles) {
      const fileName = name.replace('models/', '')
      const fileHandle = await modelsDir.getFileHandle(fileName, {create: true})
      const writable = await (fileHandle as any).createWritable()
      await writable.write(await file.arrayBuffer())
      await writable.close()
    }
  }

  console.log('[SeedManager] Saved to repository folder')
}


// ── Import ──

/**
 * Check if seed data has already been imported.
 */
function getSeedImportedVersion(): string | null {
  return localStorage.getItem(SEED_IMPORTED_KEY)
}


/**
 * Import seed data from the server into IndexedDB + OPFS.
 * Only imports records that don't already exist.
 */
export async function importSeedData(repo: ProjectRepository): Promise<void> {
  const assetBase = (typeof window !== 'undefined' && window.__ASSET_BASE__) || ''
  const seedUrl = `${assetBase}/projects/seed.json`

  let response: Response
  try {
    response = await fetch(seedUrl)
    if (!response.ok) return // No seed file — nothing to import
  } catch {
    return // Network error or file doesn't exist
  }

  let seed: SeedData
  try {
    seed = await response.json()
  } catch {
    console.warn('[SeedManager] Invalid seed.json')
    return
  }

  // Check if this exact seed has already been imported
  const seedHash = simpleHash(JSON.stringify(seed))
  if (getSeedImportedVersion() === seedHash) return

  // Import companies
  for (const company of seed.companies) {
    const existing = await repo.getCompany(company.id)
    if (!existing) {
      await repo.saveCompany(company)
    }
  }

  // Import projects
  for (const project of seed.projects) {
    const existing = await repo.getProject(project.id)
    if (!existing) {
      await repo.saveProject(project)
    }
  }

  // Import models
  for (const model of seed.models) {
    const existing = await repo.getModel(model.id)
    if (!existing) {
      await repo.saveModel(model)
    }
  }

  // Import versions + download model files
  for (const version of seed.versions) {
    const existing = await repo.getVersion(version.id)
    if (!existing) {
      // Download the model file from the server
      const fileUrl = `${assetBase}/projects/${version.seedFilePath}`
      try {
        const fileResponse = await fetch(fileUrl)
        if (!fileResponse.ok) {
          console.warn(`[SeedManager] Could not download model file: ${fileUrl}`)
          continue
        }
        const blob = await fileResponse.blob()
        const file = new File([blob], version.originalFileName, {type: 'application/octet-stream'})

        // Write to project OPFS
        await writeProjectFile(
          getProjectIdForModel(seed, version.modelId),
          version.modelId,
          version.versionNumber,
          file,
        )

        // Save version record (without seedFilePath in the stored record)
        const {seedFilePath, ...versionRecord} = version
        await repo.saveVersion(versionRecord)
      } catch (err) {
        console.warn(`[SeedManager] Error importing version ${version.id}:`, err)
      }
    }
  }

  // Mark as imported
  localStorage.setItem(SEED_IMPORTED_KEY, seedHash)
  console.log('[SeedManager] Seed data imported successfully')
}


function getProjectIdForModel(seed: SeedData, modelId: string): string {
  const model = seed.models.find((m) => m.id === modelId)
  return model?.projectId || 'unknown'
}


function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return String(hash)
}
