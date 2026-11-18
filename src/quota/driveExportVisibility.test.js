import {driveFileQuotaVisibility} from './driveVisibility'
import {isDriveModelPublic, resetDriveExportVisibility} from './driveExportVisibility'


// The classification itself is driveVisibility.test.js's; this is what the
// export side feeds it and does with the answer.
jest.mock('./driveVisibility', () => ({
  ...jest.requireActual('./driveVisibility'),
  driveFileQuotaVisibility: jest.fn(),
}))


const DRIVE_ROUTE = {kind: 'provider', provider: 'google', fileId: 'file-1'}


describe('quota/driveExportVisibility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetDriveExportVisibility()
  })

  it('classifies a Drive model from how CadView downloaded it, as its open\'s meter does', async () => {
    driveFileQuotaVisibility.mockResolvedValue('public')
    const connection = {providerId: 'google-drive'}

    expect(await isDriveModelPublic(DRIVE_ROUTE, {fileId: 'file-1', connection})).toBe(true)
    expect(driveFileQuotaVisibility).toHaveBeenCalledWith(connection, 'file-1')
  })

  it('reads a private answer, and no download record, as not public', async () => {
    driveFileQuotaVisibility.mockResolvedValue('private')
    expect(await isDriveModelPublic(DRIVE_ROUTE, {fileId: 'file-1', connection: {}})).toBe(false)
    expect(await isDriveModelPublic(DRIVE_ROUTE, null)).toBe(false)
    expect(await isDriveModelPublic(DRIVE_ROUTE, {fileId: 'another-file', connection: null})).toBe(false)
  })

  it('is never asked about anything but Drive', async () => {
    expect(await isDriveModelPublic({kind: 'file', filepath: 'a.ifc'}, {fileId: 'file-1', connection: null})).toBe(false)
    expect(driveFileQuotaVisibility).not.toHaveBeenCalled()
  })

  it('asks once per file, and answers false rather than rejecting', async () => {
    driveFileQuotaVisibility.mockRejectedValue(new Error('boom'))
    const download = {fileId: 'file-1', connection: null}

    expect(await isDriveModelPublic(DRIVE_ROUTE, download)).toBe(false)
    expect(await isDriveModelPublic(DRIVE_ROUTE, download)).toBe(false)
    expect(driveFileQuotaVisibility).toHaveBeenCalledTimes(1)
  })

  // Per open (routes/modelOpen.ts), open-205 #2022: an in-app return to the
  // file is a new open, as a page load was, and its sharing may have changed.
  it('asks again for a new open of the same file, not for the same open', async () => {
    driveFileQuotaVisibility.mockResolvedValueOnce('private').mockResolvedValueOnce('public')
    const download = {fileId: 'file-1', connection: null}
    const open = {...DRIVE_ROUTE}
    expect(await isDriveModelPublic(open, download)).toBe(false)
    expect(await isDriveModelPublic(open, download)).toBe(false)
    expect(driveFileQuotaVisibility).toHaveBeenCalledTimes(1)
    expect(await isDriveModelPublic({...DRIVE_ROUTE}, download)).toBe(true)
    expect(driveFileQuotaVisibility).toHaveBeenCalledTimes(2)
  })
})
