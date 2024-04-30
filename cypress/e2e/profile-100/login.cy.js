import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1052} */
describe('Profile 100: Login', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage, clicks ProfileControl', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('Should Login - Screen', () => {
      auth0Login()
      cy.percySnapshot()
    })
  })
})
