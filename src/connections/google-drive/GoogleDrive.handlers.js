import {http, HttpResponse} from 'msw'


export const TEST_FILE_ID = 'test-file-id-abc123'
export const TEST_FILE_NAME = 'structure.ifc'
export const TEST_FILE_CONTENT = 'ISO-10303-21; FILE_DESCRIPTION'
export const TEST_FOLDER_ID = 'test-folder-id-xyz'
export const TEST_USER_EMAIL = 'testuser@example.com'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const USERINFO_API = 'https://www.googleapis.com/oauth2/v2/userinfo'


/**
 * MSW handlers for Google Drive API endpoints.
 * Import and use in tests via getServer().use(...googleDriveHandlers()).
 *
 * @return {Array} MSW handlers
 */
export function googleDriveHandlers() {
  return [
    // Single file: metadata (default) or download (?alt=media)
    http.get(`${DRIVE_API}/files/${TEST_FILE_ID}`, ({request}) => {
      const url = new URL(request.url)
      if (url.searchParams.get('alt') === 'media') {
        return new HttpResponse(TEST_FILE_CONTENT, {
          headers: {'Content-Type': 'application/octet-stream'},
        })
      }
      return HttpResponse.json({
        name: TEST_FILE_NAME,
        mimeType: 'application/x-step',
      })
    }),

    // File listing (used by listFiles)
    http.get(`${DRIVE_API}/files`, () => {
      return HttpResponse.json({
        files: [
          {
            id: TEST_FILE_ID,
            name: TEST_FILE_NAME,
            mimeType: 'application/x-step',
            size: '2048',
            modifiedTime: '2024-06-01T12:00:00Z',
          },
          {
            id: TEST_FOLDER_ID,
            name: 'Models',
            mimeType: 'application/vnd.google-apps.folder',
          },
        ],
      })
    }),

    // User info (fetched after OAuth to get email)
    http.get(USERINFO_API, () => {
      return HttpResponse.json({email: TEST_USER_EMAIL})
    }),
  ]
}
