import {getProvider} from '../connections/registry'
import {DRIVE_VISIBILITY, driveFileQuotaVisibility} from './driveVisibility'


jest.mock('../connections/registry', () => ({getProvider: jest.fn()}))


const CONNECTION = {id: 'gd-1', providerId: 'google-drive'}
const FILE_ID = '1BxDriveFileId0000000000000'
const TEST_API_KEY = 'test-key-12345'
const HTTP_OK = 200
const HTTP_PARTIAL_CONTENT = 206
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

  /**
   * Stand in for Drive as the API key alone sees it. `media` answers the
   * `alt=media` download; `metadata` answers `files/<id>?fields=...`.
   *
   * @param {number} media HTTP status of the anonymous download
   * @param {number} [metadata] HTTP status of an anonymous metadata read
   */
  function driveAnswers(media, metadata = media) {
    global.fetch.mockImplementation((url) => {
      const status = new URL(url).searchParams.get('alt') === 'media' ? media : metadata
      return Promise.resolve({status})
    })
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
    driveAnswers(HTTP_OK)
    expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  describe('when the lookup gives no verdict', () => {
    const refused = () => Promise.reject(new Error('403 insufficientFilePermissions'))

    // Drive refuses permissions.list to a user who can only read the file.
    it.each([HTTP_PARTIAL_CONTENT, HTTP_OK])(
      'is public when the lookup is refused and the API-key download answers %p', async (status) => {
        getProvider.mockReturnValue({getVisibility: refused})
        driveAnswers(status)
        expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
        expect(global.fetch).toHaveBeenCalledTimes(1)
        const [url, init] = global.fetch.mock.calls[0]
        const requested = new URL(url)
        expect(requested.origin + requested.pathname).toBe(`https://www.googleapis.com/drive/v3/files/${FILE_ID}`)
        expect(requested.searchParams.get('key')).toBe(TEST_API_KEY)
        // The same anonymous download CadView makes, but only its first byte.
        expect(requested.searchParams.get('alt')).toBe('media')
        expect(init.headers).toEqual({Range: 'bytes=0-0'})
      })

    // A link-shared file whose owner disabled downloads for viewers: Drive
    // still serves its metadata to the key, but not its bytes (Codex, #1979).
    it('is private when the metadata is readable with the key but the download is not', async () => {
      getProvider.mockReturnValue({getVisibility: refused})
      driveAnswers(HTTP_FORBIDDEN, HTTP_OK)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
    })

    it('is private when the lookup is refused and the API-key download fails, and does not reject', async () => {
      getProvider.mockReturnValue({getVisibility: refused})
      driveAnswers(HTTP_FORBIDDEN)
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
      driveAnswers(status)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(expected)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('checks with the API key when no provider can answer', async () => {
      driveAnswers(HTTP_OK)
      getProvider.mockReturnValue(undefined)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
      getProvider.mockReturnValue({})
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PUBLIC)
      driveAnswers(HTTP_FORBIDDEN)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
    })

    it('does not ask Google with a missing API key, and counts the file as private', async () => {
      delete process.env.GOOGLE_API_KEY
      getProvider.mockReturnValue({getVisibility: refused})
      driveAnswers(HTTP_OK)
      expect(await driveFileQuotaVisibility(CONNECTION, FILE_ID)).toBe(DRIVE_VISIBILITY.PRIVATE)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
