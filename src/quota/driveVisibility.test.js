import {getProvider} from '../connections/registry'
import {DRIVE_VISIBILITY, driveFileQuotaVisibility} from './driveVisibility'


jest.mock('../connections/registry', () => ({getProvider: jest.fn()}))


const CONNECTION = {id: 'gd-1', providerId: 'google-drive'}
const FILE_ID = '1BxDriveFileId0000000000000'


describe('quota/driveVisibility#driveFileQuotaVisibility', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // CadView's API-key download only works for a link-shared file.
  it('is public for an API-key download, without a lookup', async () => {
    expect(await driveFileQuotaVisibility(null, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('is public when the permissions say anyone with the link', async () => {
    const getVisibility = jest.fn(() => Promise.resolve('public'))
    getProvider.mockReturnValue({getVisibility})
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
    expect(getProvider).toHaveBeenCalledWith('google-drive')
    expect(getVisibility).toHaveBeenCalledWith(CONNECTION, {kind: 'drive-file', fileId: FILE_ID})
  })

  // Restricted, domain-only, and a domain grant whose domain can't be told.
  it.each(['private', 'org', null])('is private when the lookup says %p', async (visibility) => {
    getProvider.mockReturnValue({getVisibility: () => Promise.resolve(visibility)})
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
  })

  it('is private when the lookup fails, and does not reject', async () => {
    getProvider.mockReturnValue({getVisibility: () => Promise.reject(new Error('403 insufficientFilePermissions'))})
    await expect(driveFileQuotaVisibility(CONNECTION, FILE_ID)).resolves.toBe(DRIVE_VISIBILITY.PRIVATE)
  })

  it('is private when no provider can answer', async () => {
    getProvider.mockReturnValue(undefined)
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
    getProvider.mockReturnValue({})
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
  })
})
