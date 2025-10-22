import {test, expect} from '@playwright/test'
import {clearState, registerIntercept, setIsReturningUser} from '../tests/e2e/utils'
import {readFile} from 'fs/promises'
import {join} from 'path'


/**
 * Route handling tests for different URL patterns
 * Tests the route processing logic from src/routes/routes.ts
 */
test.describe('Routes', () => {
  const HTTP_OK = 200

  test.beforeEach(async ({context}) => {
    await clearState(context)
    await setIsReturningUser(context)
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

  test.skip('upload IFC → redirects to /share/v/new/<UUID>.ifc and renders', async ({page}) => {
    await page.goto('/share/v/p/index.ifc') // or wherever your uploader lives

    const FIXTURES_DIR = join(__dirname, '..', '..', 'cypress', 'fixtures')
    const name = 'TestFixture.ifc'
    const ifc = join(FIXTURES_DIR, name)
    const bytes = await readFile(ifc)
    const byteArray = new Uint8Array(Array.from(bytes))

    // Create a DataTransfer with a File in the browser context and dispatch a drop.
    await page.evaluate(({byteArrayArg, nameArg}) => {
      const dropTarget = document.querySelector('[data-testid="cadview-dropzone"]') as HTMLElement
      if (!dropTarget) {
        throw new Error('Drop target not found')
      }

      const dt = new DataTransfer()
      const file = new File([byteArrayArg], nameArg, {type: 'ifc'})
      dt.items.add(file)

      // Fire enter/over/drop as many dropzones expect sequence
      dropTarget.dispatchEvent(new DragEvent('dragenter', {bubbles: true, dataTransfer: dt}))
      dropTarget.dispatchEvent(new DragEvent('dragover', {bubbles: true, dataTransfer: dt}))
      dropTarget.dispatchEvent(new DragEvent('drop', {bubbles: true, dataTransfer: dt}))
    }, {byteArrayArg: byteArray, nameArg: name})


    // URL becomes /share/v/new/<UUID>.stl — we don’t care about the exact UUID, just the shape.
    await expect(page).toHaveURL(/\/share\/v\/new\/[0-9a-fA-F-].*$/, {timeout: 30_000})

    // Wait for model ready attribute on dropzone (matching working homepage test)
    const dropzone = page.getByTestId('cadview-dropzone')
    await expect(dropzone).toHaveAttribute('data-model-ready', 'true', {timeout: 30_000})
  })
})
