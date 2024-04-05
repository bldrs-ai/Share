import {auth0Login, setPort, waitForModel} from '../../support/utils'


describe('Profile 100: Login', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
      cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'}).as('loadModel')
      cy.setCookie('isFirstTime', '1')
    })

    it('Should Login', () => {
      if (Cypress.env('CI_ENVIRONMENT')) {
        // If the test is running in GitHub Actions, skip this test
        cy.log('Skipping this test in GitHub Actions')
      } else {
      cy.log(`AUTH0_DOMAIN: ${process.env.AUTH0_DOMAIN}`)
      cy.visit('/')
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const url = new URL(currentUrl)
        setPort(url.port)
        waitForModel()
        auth0Login()
        // take screenshot
        cy.screenshot()
      })
    }
    })
  })
})
