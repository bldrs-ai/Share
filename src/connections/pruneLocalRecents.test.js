import {doesUploadExistInOPFS} from '../OPFS/utils'
import {addRecentFileEntry, loadAllRecentFiles, loadRecentFilesBySource} from './persistence'
import pruneMissingLocalRecents from './pruneLocalRecents'


jest.mock('../OPFS/utils', () => ({doesUploadExistInOPFS: jest.fn()}))


const local = (id) => ({id, source: 'local', name: id, lastModifiedUtc: null})


describe('connections/pruneLocalRecents', () => {
  beforeEach(() => {
    localStorage.clear()
    doesUploadExistInOPFS.mockReset()
  })

  it('removes local recents whose upload is gone and keeps the rest', async () => {
    addRecentFileEntry(local('live.ifc'))
    addRecentFileEntry(local('stale.ifc'))
    doesUploadExistInOPFS.mockImplementation((id) => Promise.resolve(id === 'live.ifc'))

    const removed = await pruneMissingLocalRecents()

    expect(removed).toEqual(['stale.ifc'])
    expect(loadRecentFilesBySource('local').map((f) => f.id)).toEqual(['live.ifc'])
  })

  it('keeps an entry whose check could not be made', async () => {
    addRecentFileEntry(local('unknown.ifc'))
    doesUploadExistInOPFS.mockRejectedValue(new Error('SecurityError'))

    expect(await pruneMissingLocalRecents()).toEqual([])
    expect(loadRecentFilesBySource('local')).toHaveLength(1)
  })

  it('never checks or touches other sources', async () => {
    addRecentFileEntry({id: '/share/v/gh/o/r/main/m.ifc', source: 'github', name: 'm.ifc', lastModifiedUtc: null})
    doesUploadExistInOPFS.mockResolvedValue(false)

    expect(await pruneMissingLocalRecents()).toEqual([])
    expect(doesUploadExistInOPFS).not.toHaveBeenCalled()
    expect(loadAllRecentFiles()).toHaveLength(1)
  })

  it('does not clobber an entry added while the checks were in flight', async () => {
    addRecentFileEntry(local('stale.ifc'))
    doesUploadExistInOPFS.mockImplementation(() => {
      addRecentFileEntry(local('fresh.ifc'))
      return Promise.resolve(false)
    })

    await pruneMissingLocalRecents()

    expect(loadRecentFilesBySource('local').map((f) => f.id)).toEqual(['fresh.ifc'])
  })
})
