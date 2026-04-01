import {http, HttpResponse} from 'msw'
import {getServer} from '../../__mocks__/server'
import {googleDriveBrowser} from './GoogleDriveBrowser'
import {
  googleDriveHandlers,
  TEST_FILE_CONTENT,
  TEST_FILE_ID,
  TEST_FILE_NAME,
  TEST_FOLDER_ID,
  TEST_MODIFIED_TIME,
} from './GoogleDrive.handlers'


jest.mock('./GoogleDriveProvider', () => ({
  googleDriveProvider: {
    getAccessToken: jest.fn().mockResolvedValue('ya29.test-access-token'),
  },
}))

const mockConnection = {
  id: 'gdrive-test-1',
  providerId: 'google-drive',
  label: 'Google Drive (test)',
  status: 'connected',
  createdAt: new Date().toISOString(),
  meta: {},
}

const mockSource = {
  id: 'src-1',
  connectionId: 'gdrive-test-1',
  providerId: 'google-drive',
  label: 'Models',
  location: {type: 'google-drive', folderId: TEST_FOLDER_ID, folderName: 'Models'},
  createdAt: new Date().toISOString(),
}


describe('GoogleDriveBrowser', () => {
  beforeEach(() => {
    getServer().use(...googleDriveHandlers())
  })


  describe('getFileDownload', () => {
    it('fetches metadata then downloads file content as blob', async () => {
      const result = await googleDriveBrowser.getFileDownload(mockConnection, null, TEST_FILE_ID)

      expect(result.filename).toBe(TEST_FILE_NAME)
      expect(result.mimeType).toBe('application/x-step')
      expect(result.modifiedAt).toBe(TEST_MODIFIED_TIME)
      expect(result.blob).toBeInstanceOf(Blob)
      expect(await result.blob.text()).toBe(TEST_FILE_CONTENT)
    })

    it('throws when metadata request fails', async () => {
      getServer().use(
        http.get(
          `https://www.googleapis.com/drive/v3/files/${TEST_FILE_ID}`,
          () => new HttpResponse(null, {status: 403}),
        ),
      )

      await expect(
        googleDriveBrowser.getFileDownload(mockConnection, null, TEST_FILE_ID),
      ).rejects.toThrow('Failed to fetch file metadata: 403')
    })

    it('throws when file download fails', async () => {
      getServer().use(
        http.get(
          `https://www.googleapis.com/drive/v3/files/${TEST_FILE_ID}`,
          ({request}) => {
            if (new URL(request.url).searchParams.get('alt') === 'media') {
              return new HttpResponse(null, {status: 500})
            }
            return HttpResponse.json({name: TEST_FILE_NAME, mimeType: 'application/x-step'})
          },
        ),
      )

      await expect(
        googleDriveBrowser.getFileDownload(mockConnection, null, TEST_FILE_ID),
      ).rejects.toThrow('Failed to download file: 500')
    })
  })


  describe('listFiles', () => {
    it('returns structured files and folders from Drive API', async () => {
      const result = await googleDriveBrowser.listFiles(mockConnection, mockSource)

      expect(result.files).toHaveLength(1)
      expect(result.files[0]).toMatchObject({id: TEST_FILE_ID, name: TEST_FILE_NAME})

      expect(result.folders).toHaveLength(1)
      expect(result.folders[0]).toMatchObject({id: TEST_FOLDER_ID, name: 'Models'})
    })

    it('throws when Drive API returns an error', async () => {
      getServer().use(
        http.get('https://www.googleapis.com/drive/v3/files', () =>
          new HttpResponse('{"error": "forbidden"}', {status: 403}),
        ),
      )

      await expect(
        googleDriveBrowser.listFiles(mockConnection, mockSource),
      ).rejects.toThrow('Google Drive API error (403)')
    })
  })
})
