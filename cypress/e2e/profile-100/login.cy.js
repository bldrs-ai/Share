import {
  auth0Login,
  clearState,
  interceptIndex,
  setIsReturningUser,
  setPort,
  visitHomepage,
  waitForModel,
} from '../../support/utils'


describe('Profile 100: Login', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      clearState()
      // cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'}).as('loadModel')
      // cy.setCookie('isFirstTime', '1')
      setIsReturningUser()
      // setupAuthenticationIntercepts()
      interceptIndex()
    })

    it('Should Login', () => {
      visitHomepage()
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const url = new URL(currentUrl)
        setPort(url.port)
        waitForModel()
        auth0Login()
        // take screenshot
        // cy.screenshot()
      })
    })
  })
})
