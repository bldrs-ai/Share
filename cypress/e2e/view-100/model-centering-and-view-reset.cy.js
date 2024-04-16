import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  waitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1042} */
describe('view 100: Mdel centering and view reset', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
    cy.visit('/share/v/p/index.ifc#c:-38.078,-196.189,-2.314,-38.078,22.64,-2.314')
    waitForModel()
  })

  it('Model re-centered with autozoom - Screen', cy.percySnapshot())
})
