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
describe('Open 200: Open STEP Model', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    const interceptTag = 'stepLoad'
    beforeEach(() => {
      setIsReturningUser()
      const sharePathToGear = '/share/v/gh/bldrs-ai/test-models/main/step/gear.step.ifc'
      setupVirtualPathIntercept(sharePathToGear, '/gear.step', interceptTag)
      cy.visit(sharePathToGear)
    })

    it('Loads gear.step (with .ifc hack) - Screen', () => {
      waitForModelReady(interceptTag)
      cy.percySnapshot()
    })
  })
})
