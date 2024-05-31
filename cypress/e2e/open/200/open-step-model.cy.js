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
    const stepPath = '/share/v/gh/bldrs-ai/test-models/main/step/gear.step'
    const stepInterceptTag = 'stepLoad'

    const stpPath = '/share/v/gh/bldrs-ai/test-models/main/step/gear.stp'
    const stpInterceptTag = 'stpLoad'

    beforeEach(() => {
      setIsReturningUser()
      // Use same actual file for both
      setupVirtualPathIntercept(stepPath, '/gear.step', stepInterceptTag)
      setupVirtualPathIntercept(stpPath, '/gear.step', stpInterceptTag)
    })

    it('Loads gear.step - Screen', () => {
      cy.visit(stepPath)
      waitForModelReady(stepInterceptTag)
      cy.percySnapshot()
    })

    it('Loads gear.stp - Screen', () => {
      cy.visit(stpPath)
      waitForModelReady(stpInterceptTag)
      cy.percySnapshot()
    })
  })
})
