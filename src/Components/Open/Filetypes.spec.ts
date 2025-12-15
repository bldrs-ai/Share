import {Page, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for opening models in multiple file formats.
 * Tests support for various 3D model file formats (FBX, OBJ, STL, STEP, STP).
 *
 * Migrated from cypress/e2e/open/200/open-multiple-model-formats.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/757
 */
describe('Open 200: Open Models in multiple formats', () => {
  /**
   * @property {string} urlPath Path user would provide at GitHub
   * @property {string} filePath Actual fixture to use
   * @property {string} debugTag debugging name for intercept
   */
  async function doTest({page, urlPath, filePath, debugTag}: {page: Page, urlPath: string, filePath: string, debugTag: string}) {
    await setupVirtualPathIntercept(page, urlPath, filePath)
    await page.goto(urlPath)
    await waitForModelReady(page)
    await expectScreen(page, `Filetypes-${debugTag}.png`)
  }

  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('Loads FBX - Screen', async ({page}) => {
    await doTest({
      page,
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/fbx/samba-dancing.fbx',
      filePath: 'test-models/fbx/samba-dancing.fbx',
      debugTag: 'fbxLoad',
    })
  })

  test('Loads OBJ - Screen', async ({page}) => {
    await doTest({
      page,
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/obj/Bunny.obj',
      filePath: 'test-models/obj/Bunny.obj',
      debugTag: 'objLoad',
    })
  })

  test('Loads STL (test) - Screen', async ({page}) => {
    await doTest({
      page,
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/stl/slotted_disk.stl',
      filePath: 'test-models/stl/slotted_disk.stl',
      debugTag: 'stlTextLoad',
    })
  })

  test('Loads STL (binary) - Screen', async ({page}) => {
    await doTest({
      page,
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/stl/pr2_head_pan.stl',
      filePath: 'test-models/stl/pr2_head_pan.stl',
      debugTag: 'stlBinaryLoad',
    })
  })

  test.skip('Loads STEP - Screen', async ({page}) => {
    await doTest({
      page,
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/step/gear.step',
      filePath: 'test-models/step/gear.step',
      debugTag: 'stepLoad',
    })
  })

  test.skip('Loads STP - Screen', async ({page}) => {
    // Use same actual local file, just testing .stp handling
    await doTest({
      page,
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/step/gear.stp',
      filePath: 'test-models/step/gear.step',
      debugTag: 'stpLoad',
    })
  })
})
