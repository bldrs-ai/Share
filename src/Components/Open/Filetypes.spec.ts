import {Page, test} from '@playwright/test'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'
import {setupGithubPathIntercept} from '../../tests/e2e/models'
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
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  type DoTestParams = {
    page: Page
    githubPathname: string
    gotoPathname: string
    fixturePath: string
    debugTag: string
  }

  /** Test helper for opening models in different file formats. */
  async function doTest({page, githubPathname, gotoPathname, fixturePath, debugTag}: DoTestParams): Promise<void> {
    const waitForModelReadyCallback = await setupGithubPathIntercept(page, githubPathname, gotoPathname, fixturePath)
    await waitForModelReadyCallback()
    await expectScreen(page, `Filetypes-${debugTag}.png`)
  }

  test('Loads FBX - Screen', async ({page}) => {
    await doTest({
      page,
      githubPathname: '/bldrs-ai/test-models/main/fbx/samba-dancing.fbx',
      gotoPathname: '/share/v/gh/bldrs-ai/test-models/main/fbx/samba-dancing.fbx',
      fixturePath: 'test-models/fbx/samba-dancing.fbx',
      debugTag: 'fbxLoad',
    })
  })

  test('Loads OBJ - Screen', async ({page}) => {
    await doTest({
      page,
      githubPathname: '/bldrs-ai/test-models/main/obj/Bunny.obj',
      gotoPathname: '/share/v/gh/bldrs-ai/test-models/main/obj/Bunny.obj',
      fixturePath: 'test-models/obj/Bunny.obj',
      debugTag: 'objLoad',
    })
  })

  test('Loads STL (test) - Screen', async ({page}) => {
    await doTest({
      page,
      githubPathname: '/bldrs-ai/test-models/main/stl/slotted_disk.stl',
      gotoPathname: '/share/v/gh/bldrs-ai/test-models/main/stl/slotted_disk.stl',
      fixturePath: 'test-models/stl/slotted_disk.stl',
      debugTag: 'stlTextLoad',
    })
  })

  test('Loads STL (binary) - Screen', async ({page}) => {
    await doTest({
      page,
      githubPathname: '/bldrs-ai/test-models/main/stl/pr2_head_pan.stl',
      gotoPathname: '/share/v/gh/bldrs-ai/test-models/main/stl/pr2_head_pan.stl',
      fixturePath: 'test-models/stl/pr2_head_pan.stl',
      debugTag: 'stlBinaryLoad',
    })
  })

  test('Loads STEP - Screen', async ({page}) => {
    await doTest({
      page,
      githubPathname: '/bldrs-ai/test-models/main/step/gear.step',
      gotoPathname: '/share/v/gh/bldrs-ai/test-models/main/step/gear.step',
      fixturePath: 'test-models/step/gear.step',
      debugTag: 'stepLoad',
    })
  })

  test('Loads STP - Screen', async ({page}) => {
    // Use same actual local file, just testing .stp handling
    await doTest({
      page,
      githubPathname: '/bldrs-ai/test-models/main/step/gear.stp',
      gotoPathname: '/share/v/gh/bldrs-ai/test-models/main/step/gear.stp',
      fixturePath: 'test-models/step/gear.step',
      debugTag: 'stpLoad',
    })
  })
})
