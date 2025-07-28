import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../../support/utils'
import {
  setupVirtualPathIntercept,
  waitForModelReady,
} from '../../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/757} */
describe('Open 200: Open Models in multiple formats', () => {
  /**
   * @property {string} urlPath Path user would provide at GitHub
   * @property {string} filePath Actual fixture to use
   * @property {string} debugTag debugging name for intercept
   */
  function doTest({urlPath, filePath, debugTag}) {
    setupVirtualPathIntercept(urlPath, filePath, debugTag)
    cy.visit(urlPath)
    waitForModelReady(debugTag)
    cy.percySnapshot()
  }

  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  it.skip('Loads FBX - Screen', () => {
    doTest({
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/fbx/samba-dancing.fbx',
      filePath: 'test-models/fbx/samba-dancing.fbx',
      debugTag: 'fbxLoad',
    })
  })

  it.only('Loads OBJ - Screen', () => {
    doTest({
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/obj/Bunny.obj',
      filePath: 'test-models/obj/Bunny.obj',
      debugTag: 'objLoad',
    })
  })

  it('Loads STL (test) - Screen', () => {
    doTest({
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/stl/slotted_disk.stl',
      filePath: 'test-models/stl/slotted_disk.stl',
      debugTag: 'stlTextLoad',
    })
  })

  it.skip('Loads STL (binary) - Screen', () => {
    doTest({
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/stl/pr2_head_pan.stl',
      filePath: 'test-models/stl/pr2_head_pan.stl',
      debugTag: 'stlBinaryLoad',
    })
  })

  it('Loads STEP - Screen', () => {
    doTest({
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/step/gear.step',
      filePath: 'test-models/step/gear.step',
      debugTag: 'stepLoad',
    })
  })

  it('Loads STP - Screen', () => {
    // Use same actual local file, just testing .stp handling
    doTest({
      urlPath: '/share/v/gh/bldrs-ai/test-models/main/step/gear.stp',
      filePath: 'test-models/step/gear.step',
      debugTag: 'stpLoad',
    })
  })
})
