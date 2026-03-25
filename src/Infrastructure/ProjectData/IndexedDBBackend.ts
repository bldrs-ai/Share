import {
  Company,
  Project,
  ModelRef,
  ModelVersion,
  AppDataEnvelope,
  ProjectRepository,
} from './types'


const DB_NAME = 'bldrs-projects'
const DB_VERSION = 2

const COMPANIES = 'companies'
const PROJECTS = 'projects'
const MODELS = 'models'
const MODEL_VERSIONS = 'modelVersions'
const APP_DATA = 'appData'


let cachedDB: Promise<IDBDatabase> | null = null


function openDB(): Promise<IDBDatabase> {
  if (cachedDB) return cachedDB

  cachedDB = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(COMPANIES)) {
        db.createObjectStore(COMPANIES, {keyPath: 'id'})
      }

      if (!db.objectStoreNames.contains(PROJECTS)) {
        const store = db.createObjectStore(PROJECTS, {keyPath: 'id'})
        store.createIndex('companyId', 'companyId', {unique: false})
      }

      if (!db.objectStoreNames.contains(MODELS)) {
        const store = db.createObjectStore(MODELS, {keyPath: 'id'})
        store.createIndex('projectId', 'projectId', {unique: false})
        store.createIndex('fileHash', 'fileHash', {unique: false})
      }

      if (!db.objectStoreNames.contains(MODEL_VERSIONS)) {
        const store = db.createObjectStore(MODEL_VERSIONS, {keyPath: 'id'})
        store.createIndex('modelId', 'modelId', {unique: false})
      }

      if (!db.objectStoreNames.contains(APP_DATA)) {
        const store = db.createObjectStore(APP_DATA, {keyPath: ['projectId', 'appId']})
        store.createIndex('projectId', 'projectId', {unique: false})
        store.createIndex('appId', 'appId', {unique: false})
      }
    }
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result)
    request.onerror = (event) => {
      cachedDB = null
      reject((event.target as IDBOpenDBRequest).error)
    }
    request.onblocked = () => {
      // Old connections are blocking the upgrade — delete and retry
      cachedDB = null
      console.warn('[ProjectData] DB upgrade blocked — deleting and recreating')
      indexedDB.deleteDatabase(DB_NAME)
      resolve(openDB() as unknown as IDBDatabase)
    }
  })

  return cachedDB
}


function getAll<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error)
    }),
  )
}


function getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => resolve((request.result as T) ?? null)
      request.onerror = () => reject(request.error)
    }),
  )
}


function getAllByIndex<T>(storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(value)
      request.onsuccess = () => resolve(request.result as T[])
      request.onerror = () => reject(request.error)
    }),
  )
}


function getOneByIndex<T>(storeName: string, indexName: string, value: IDBValidKey): Promise<T | null> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.get(value)
      request.onsuccess = () => resolve((request.result as T) ?? null)
      request.onerror = () => reject(request.error)
    }),
  )
}


function put<T>(storeName: string, record: T): Promise<void> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }),
  )
}


function del(storeName: string, key: IDBValidKey): Promise<void> {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }),
  )
}


export class IndexedDBBackend implements ProjectRepository {
  // Companies
  listCompanies(): Promise<Company[]> {
    return getAll<Company>(COMPANIES)
  }

  getCompany(id: string): Promise<Company | null> {
    return getByKey<Company>(COMPANIES, id)
  }

  saveCompany(company: Company): Promise<void> {
    return put(COMPANIES, company)
  }

  async deleteCompany(id: string): Promise<void> {
    // Cascade: delete projects, their models, and app data
    const projects = await this.listProjects(id)
    for (const project of projects) {
      await this.deleteProject(project.id)
    }
    return del(COMPANIES, id)
  }

  // Projects
  listProjects(companyId: string): Promise<Project[]> {
    return getAllByIndex<Project>(PROJECTS, 'companyId', companyId)
  }

  getProject(id: string): Promise<Project | null> {
    return getByKey<Project>(PROJECTS, id)
  }

  saveProject(project: Project): Promise<void> {
    return put(PROJECTS, project)
  }

  async deleteProject(id: string): Promise<void> {
    // Cascade: delete models (with their versions) and app data for this project
    const models = await this.listModels(id)
    for (const model of models) {
      await this.deleteModel(model.id)
    }
    // Delete app data — composite key requires listing first
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(APP_DATA, 'readwrite')
      const store = tx.objectStore(APP_DATA)
      const index = store.index('projectId')
      const request = index.openCursor(id)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return del(PROJECTS, id)
  }

  // Models
  listModels(projectId: string): Promise<ModelRef[]> {
    return getAllByIndex<ModelRef>(MODELS, 'projectId', projectId)
  }

  getModel(id: string): Promise<ModelRef | null> {
    return getByKey<ModelRef>(MODELS, id)
  }

  findModelByHash(fileHash: string): Promise<ModelRef | null> {
    return getOneByIndex<ModelRef>(MODELS, 'fileHash', fileHash)
  }

  saveModel(model: ModelRef): Promise<void> {
    return put(MODELS, model)
  }

  async deleteModel(id: string): Promise<void> {
    // Cascade: delete all versions for this model
    const versions = await this.listVersions(id)
    for (const version of versions) {
      await del(MODEL_VERSIONS, version.id)
    }
    return del(MODELS, id)
  }

  // Model versions
  listVersions(modelId: string): Promise<ModelVersion[]> {
    return getAllByIndex<ModelVersion>(MODEL_VERSIONS, 'modelId', modelId)
  }

  getVersion(id: string): Promise<ModelVersion | null> {
    return getByKey<ModelVersion>(MODEL_VERSIONS, id)
  }

  saveVersion(version: ModelVersion): Promise<void> {
    return put(MODEL_VERSIONS, version)
  }

  deleteVersion(id: string): Promise<void> {
    return del(MODEL_VERSIONS, id)
  }

  // App data
  getAppData<T>(projectId: string, appId: string): Promise<AppDataEnvelope<T> | null> {
    return getByKey<AppDataEnvelope<T>>(APP_DATA, [projectId, appId])
  }

  saveAppData<T>(envelope: AppDataEnvelope<T>): Promise<void> {
    return put(APP_DATA, envelope)
  }

  deleteAppData(projectId: string, appId: string): Promise<void> {
    return del(APP_DATA, [projectId, appId])
  }
}
