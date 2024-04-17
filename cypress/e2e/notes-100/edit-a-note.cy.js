
import {setupAuthenticationIntercepts, waitForModel, homepageSetup} from '../../support/utils'


describe('edit a note', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      homepageSetup()

      cy.setCookie('isFirstTime', '1')

      setupAuthenticationIntercepts()
    })

    it('should not find Save IFC button before login', () => {
      cy.visit('/')
      waitForModel()
      cy.findByTestId('Save', {timeout: 10000}).should('not.exist')
      // cy.screenshot()
    })

    /* it('should only find Save IFC button after login', () => {
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
    })*/

    /* it.only('should log in and save a model', () => {
      cy.visit('/')
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const url = new URL(currentUrl)
        setPort(url.port)
        waitForModel()
        cy.findByTitle('Save', {timeout: 5000}).should('not.exist')
        auth0Login()
        cy.findByTitle('Save', {timeout: 5000}).should('exist').click({force: true})

        cy.findByLabelText('Organization', {timeout: 5000}).click()

        cy.contains('@cypresstester').click()

        cy.findByLabelText('Repository', {timeout: 5000}).eq(0).click()

        cy.contains('test-repo').click()

        cy.findByLabelText('Enter file name').click().type('save-model-test.ifc')

        cy.contains('button', 'Save model').click()
      })
    })*/
  })
})
