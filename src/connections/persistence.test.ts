import {
  addRecentFileEntry,
  clearRecentFilesBySource,
  loadAllRecentFiles,
  loadRecentFilesBySource,
  removeRecentFileEntries,
  updateRecentFileLastModified,
  updateRecentFileModelTitle,
} from './persistence'


const GITHUB_ENTRY = {
  id: '/share/v/gh/org/repo/main/model.ifc',
  source: 'github' as const,
  name: 'model.ifc',
  lastModifiedUtc: null,
}

const COMMIT_DATE_MS = 1234567890000
const SMALL_MS = 9999
const OLD_MS = 1000
const NEW_MS = 2000


describe('updateRecentFileLastModified', () => {
  beforeEach(() => localStorage.clear())

  it('updates lastModifiedUtc for a matching entry', () => {
    addRecentFileEntry(GITHUB_ENTRY)
    updateRecentFileLastModified(GITHUB_ENTRY.id, COMMIT_DATE_MS)
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.lastModifiedUtc).toBe(COMMIT_DATE_MS)
  })

  it('does not modify other fields when updating lastModifiedUtc', () => {
    addRecentFileEntry({...GITHUB_ENTRY, modelTitle: 'My Model'})
    updateRecentFileLastModified(GITHUB_ENTRY.id, SMALL_MS)
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.modelTitle).toBe('My Model')
    expect(entry.name).toBe('model.ifc')
  })

  it('is a no-op when no entry matches the id', () => {
    addRecentFileEntry(GITHUB_ENTRY)
    updateRecentFileLastModified('non-existent-id', SMALL_MS)
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.lastModifiedUtc).toBeNull()
  })

  it('overwrites a previously set lastModifiedUtc', () => {
    addRecentFileEntry({...GITHUB_ENTRY, lastModifiedUtc: OLD_MS})
    updateRecentFileLastModified(GITHUB_ENTRY.id, NEW_MS)
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.lastModifiedUtc).toBe(NEW_MS)
  })
})


describe('updateRecentFileModelTitle', () => {
  beforeEach(() => localStorage.clear())

  it('updates modelTitle for a matching entry', () => {
    addRecentFileEntry(GITHUB_ENTRY)
    updateRecentFileModelTitle(GITHUB_ENTRY.id, 'My Model')
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.modelTitle).toBe('My Model')
  })

  it('is a no-op when no entry matches the id', () => {
    addRecentFileEntry(GITHUB_ENTRY)
    updateRecentFileModelTitle('non-existent-id', 'My Model')
    const [entry] = loadRecentFilesBySource('github')
    expect(entry.modelTitle).toBeUndefined()
  })
})


describe('removeRecentFileEntries', () => {
  beforeEach(() => localStorage.clear())

  const local = (id: string) => ({id, source: 'local' as const, name: id, lastModifiedUtc: null})

  it('removes only the listed ids of the given source', () => {
    addRecentFileEntry(local('a.ifc'))
    addRecentFileEntry(local('b.ifc'))
    addRecentFileEntry(GITHUB_ENTRY)
    removeRecentFileEntries('local', ['a.ifc'])
    expect(loadRecentFilesBySource('local').map((f) => f.id)).toEqual(['b.ifc'])
    expect(loadRecentFilesBySource('github')).toHaveLength(1)
  })

  it('leaves an entry of another source with the same id alone', () => {
    addRecentFileEntry({...GITHUB_ENTRY, id: 'same'})
    addRecentFileEntry(local('same'))
    removeRecentFileEntries('local', ['same'])
    expect(loadAllRecentFiles()).toEqual([expect.objectContaining({id: 'same', source: 'github'})])
  })
})


describe('clearRecentFilesBySource', () => {
  beforeEach(() => localStorage.clear())

  it('drops every entry of that source and keeps the rest', () => {
    addRecentFileEntry({id: 'a.ifc', source: 'local', name: 'a.ifc', lastModifiedUtc: null})
    addRecentFileEntry(GITHUB_ENTRY)
    clearRecentFilesBySource('local')
    expect(loadRecentFilesBySource('local')).toEqual([])
    expect(loadRecentFilesBySource('github')).toHaveLength(1)
  })
})
