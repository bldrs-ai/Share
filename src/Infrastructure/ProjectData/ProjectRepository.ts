import {ProjectRepository} from './types'
import {IndexedDBBackend} from './IndexedDBBackend'


let instance: ProjectRepository | null = null


/**
 * Get the singleton ProjectRepository.
 * Currently returns IndexedDBBackend; swap to RestApiBackend when a server is added.
 */
export function getProjectRepository(): ProjectRepository {
  if (!instance) {
    instance = new IndexedDBBackend()
  }
  return instance
}
