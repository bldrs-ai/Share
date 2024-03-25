
import {auth0Login, setPort, setupAuthenticationIntercepts, waitForModel} from '../../support/utils'


describe('save model', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
      cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'}).as('loadModel')
      cy.setCookie('isFirstTime', '1')

      setupAuthenticationIntercepts()
    })

    it('should not find Save IFC button before login', () => {
      cy.visit('/')
      waitForModel()
      cy.findByTestId('Save', {timeout: 10000}).should('not.exist')
      // cy.screenshot()
    })

    it('should only find Save IFC button after login', () => {
      cy.visit('/')
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const url = new URL(currentUrl)
        setPort(url.port)
        waitForModel()
        cy.findByTitle('Save', {timeout: 5000}).should('not.exist')
        auth0Login()
        cy.findByTitle('Save', {timeout: 5000}).should('exist')

        //  cy.screenshot()
      })
    })

    it.only('should log in and save a model', () => {
      cy.visit('/')
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const url = new URL(currentUrl)
        setPort(url.port)
        waitForModel()
        cy.findByTitle('Save', {timeout: 5000}).should('not.exist')
        auth0Login()
        cy.findByTitle('Save', {timeout: 5000}).should('exist').click({force: true})
      })
    })
  })
})
