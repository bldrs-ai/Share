import {test, expect} from '@playwright/test'
import {registerIntercept} from '../tests/e2e/utils'


/**
 * Route handling tests for different URL patterns
 * Tests the route processing logic from src/routes/routes.ts
 */
test.describe('Routes', () => {
  const HTTP_OK = 200

  test.beforeEach(async ({context}) => {
    // Set returning user cookie to skip about dialog
    await context.addCookies([
      {
        name: 'isFirstTime',
        value: '1',
        domain: 'localhost',
        path: '/',
      },
    ])
  })


  // TODO(pablo): these are failing on GHA due to the raw calls to bldrs.dev.. env needs some work.
  // GitHub route (/gh)
  test.skip('GitHub route (/gh) processes URL correctly', async ({page}) => {
    const ghInterceptPattern = new RegExp('https://rawgit\\.bldrs\\.dev/model/bldrs-ai/Share/main/public/index\\.ifc')
    const ghResponseUrlStr = 'https://rawgit.bldrs.dev/model/bldrs-ai/Share/main/public/index.ifc'
    const response = await registerIntercept({
      page,
      intereceptPattern: ghInterceptPattern,
      responseUrlStr: ghResponseUrlStr,
      fixtureFilename: 'index.ifc',
      gotoPath: `/share/v/gh/bldrs-ai/Share/main/public/index.ifc`,
    })

    expect(response.status()).toBe(HTTP_OK)
  })


  const mockFileId = '17aKaRB6EU2fJtBpmpmZ87IlwZ-J-4XrU'
  const gapiPattern = new RegExp(`https://www\\.googleapis\\.com/drive/v3/files/${mockFileId}($|\\?)`)
  // Generic URL route (/u)
  test('Generic URL route (/u) handles Google Drive URLs', async ({page}) => {
    const googleDriveUrlStr = encodeURIComponent(`https://drive.google.com/file/d/${mockFileId}/view`)

    const response = await registerIntercept({
      page,
      intereceptPattern: gapiPattern,
      responseUrlStr: `https://www.googleapis.com/drive/v3/files/${mockFileId}`,
      fixtureFilename: 'index.ifc',
      gotoPath: `/share/v/u/${googleDriveUrlStr}`,
    })

    expect(response.status()).toBe(HTTP_OK)
  })


  // Google Drive file ID route (/g)
  test('Google Drive file ID route (/g) processes file ID', async ({page}) => {
    const response = await registerIntercept({
      page,
      intereceptPattern: gapiPattern,
      responseUrlStr: `https://www.googleapis.com/drive/v3/files/${mockFileId}`,
      fixtureFilename: 'index.ifc',
      gotoPath: `/share/v/g/${mockFileId}`,
    })

    expect(response.status()).toBe(HTTP_OK)
  })


  test('Google Drive URL route (/g) processes Google Drive URL', async ({page}) => {
    // Mock Google Drive URL format
    const googleDriveUrlStr = encodeURIComponent(`https://drive.google.com/file/d/${mockFileId}/view`)

    const response = await registerIntercept({
      page,
      intereceptPattern: gapiPattern,
      responseUrlStr: `https://www.googleapis.com/drive/v3/files/${mockFileId}`,
      fixtureFilename: 'index.ifc',
      gotoPath: `/share/v/g/${googleDriveUrlStr}`,
    })

    expect(response.status()).toBe(HTTP_OK)
  })


  // New file route (/new)
  test('New file route (/new) processes uploaded file', async ({page}) => {
    // Pattern to match the local file request for a newly uploaded file
    const newFilePattern = new RegExp('http://localhost:[0-9]+/index\\.ifc')

    const response = await registerIntercept({
      page,
      intereceptPattern: newFilePattern,
      responseUrlStr: 'http://localhost',
      fixtureFilename: 'index.ifc',
      gotoPath: `/share/v/new/index.ifc`,
    })

    expect(response.status()).toBe(HTTP_OK)
  })


  // New file route with element path
  test('New file route (/new) processes uploaded file with element path', async ({page}) => {
    const newFilePattern = new RegExp('http://localhost:[0-9]+/index\\.ifc')

    const response = await registerIntercept({
      page,
      intereceptPattern: newFilePattern,
      responseUrlStr: 'http://localhost',
      fixtureFilename: 'index.ifc',
      gotoPath: `/share/v/new/index.ifc/1/2/3`,
    })

    expect(response.status()).toBe(HTTP_OK)
  })
})
