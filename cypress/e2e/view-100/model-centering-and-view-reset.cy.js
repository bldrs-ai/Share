import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  waitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1042} */
describe('view 100: Model centering and view reset', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
    cy.visit('/share/v/p/index.ifc#c:-38.078,-196.189,-2.314,-38.078,22.64,-2.314')
    waitForModel()
  })

  /**
   * This is just testing that auto-zoom works.  Not really user-facing behavior.
   * [Discord]{@link https://discord.com/channels/853953158560743424/984184622621540352/1229766172199616584}
   */
  it('Model re-centered with when camera hash removed - Screen', () => {
    cy.visit('/share/v/p/index.ifc')
    waitForModel()
    cy.percySnapshot()
  })
})
