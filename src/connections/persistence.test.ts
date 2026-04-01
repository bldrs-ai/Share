import {
  addRecentFileEntry,
  loadRecentFilesBySource,
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
