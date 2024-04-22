import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


describe('Profile 100: Login', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage, clicks ProfileControl', () => {
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
    })

    it('Should Login - Screen', () => {
      auth0Login()
      cy.percySnapshot()
    })
  })
})
