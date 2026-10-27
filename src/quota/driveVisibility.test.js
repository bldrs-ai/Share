import {getProvider} from '../connections/registry'
import {DRIVE_VISIBILITY, driveFileQuotaVisibility} from './driveVisibility'


jest.mock('../connections/registry', () => ({getProvider: jest.fn()}))


const CONNECTION = {id: 'gd-1', providerId: 'google-drive'}
const FILE_ID = '1BxDriveFileId0000000000000'
const TEST_API_KEY = 'test-key-12345'
const HTTP_OK = 200
const HTTP_FORBIDDEN = 403


describe('quota/driveVisibility#driveFileQuotaVisibility', () => {
  const realFetch = global.fetch
  const realApiKey = process.env.GOOGLE_API_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GOOGLE_API_KEY = TEST_API_KEY
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = realFetch
    if (realApiKey === undefined) {
      delete process.env.GOOGLE_API_KEY
    } else {
      process.env.GOOGLE_API_KEY = realApiKey
    }
  })

  /** @param {number} status the API-key metadata check's HTTP status */
  function metadataCheckAnswers(status) {
    global.fetch.mockResolvedValue({ok: status === HTTP_OK, status})
  }

  // CadView's API-key download only works for a link-shared file.
  it('is public for an API-key download, without a lookup', async () => {
    expect(await driveFileQuotaVisibility(null, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
    expect(getProvider).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('is public when the permissions say anyone with the link, with no API-key call', async () => {
    const getVisibility = jest.fn(() => Promise.resolve('public'))
    getProvider.mockReturnValue({getVisibility})
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
    expect(getProvider).toHaveBeenCalledWith('google-drive')
    expect(getVisibility).toHaveBeenCalledWith(CONNECTION, {kind: 'drive-file', fileId: FILE_ID})
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // Restricted, and domain-only: the lookup answered, so it is not second-guessed
  // even if the API-key check would say yes.
  it.each(['private', 'org'])('is private when the lookup says %p, with no API-key call', async (visibility) => {
    getProvider.mockReturnValue({getVisibility: () => Promise.resolve(visibility)})
    metadataCheckAnswers(HTTP_OK)
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  describe('when the lookup gives no verdict', () => {
    const refused = () => Promise.reject(new Error('403 insufficientFilePermissions'))

    // Drive refuses permissions.list to a user who can only read the file.
    it('is public when the lookup is refused and the API-key metadata check succeeds', async () => {
      getProvider.mockReturnValue({getVisibility: refused})
      metadataCheckAnswers(HTTP_OK)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
      expect(global.fetch).toHaveBeenCalledTimes(1)
      const requested = new URL(global.fetch.mock.calls[0][0])
      expect(requested.origin + requested.pathname).toBe(`https://www.googleapis.com/drive/v3/files/${FILE_ID}`)
      expect(requested.searchParams.get('key')).toBe(TEST_API_KEY)
      // Metadata only, never the file's bytes.
      expect(requested.searchParams.get('alt')).toBeNull()
    })

    it('is private when the lookup is refused and the API-key check fails, and does not reject', async () => {
      getProvider.mockReturnValue({getVisibility: refused})
      metadataCheckAnswers(HTTP_FORBIDDEN)
      await expect(driveFileQuotaVisibility(CONNECTION, FILE_ID)).resolves.toBe(DRIVE_VISIBILITY.PRIVATE)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('is private when the API-key check cannot reach Google, and does not reject', async () => {
      getProvider.mockReturnValue({getVisibility: refused})
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(driveFileQuotaVisibility(CONNECTION, FILE_ID)).resolves.toBe(DRIVE_VISIBILITY.PRIVATE)
    })

    // A domain grant whose domain can't be told.
    it.each([
      [HTTP_OK, DRIVE_VISIBILITY.PUBLIC],
      [HTTP_FORBIDDEN, DRIVE_VISIBILITY.PRIVATE],
    ])('checks with the API key when the lookup says null (check status %p)', async (status, expected) => {
      getProvider.mockReturnValue({getVisibility: () => Promise.resolve(null)})
      metadataCheckAnswers(status)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(expected)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('checks with the API key when no provider can answer', async () => {
      metadataCheckAnswers(HTTP_OK)
      getProvider.mockReturnValue(undefined)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
      getProvider.mockReturnValue({})
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
      metadataCheckAnswers(HTTP_FORBIDDEN)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
    })

    it('does not ask Google with a missing API key, and counts the file as private', async () => {
      delete process.env.GOOGLE_API_KEY
      getProvider.mockReturnValue({getVisibility: refused})
      metadataCheckAnswers(HTTP_OK)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
