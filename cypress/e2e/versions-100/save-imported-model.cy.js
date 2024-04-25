import '@percy/cypress'
import {waitForModel, homepageSetup, auth0Login} from '../../support/utils'


describe('Versions 100: Save Model', () => {
  beforeEach(() => {
    homepageSetup()
    cy.setCookie('isFirstTime', '1')
    cy.visit('/')
  })

  context('Visit homepage without model loaded', () => {
    it('Check absence of Save IFC button pre-login', () => {
      waitForModel()
      cy.findByTestId('Save', {timeout: 10000}).should('not.exist')
      cy.percySnapshot()
    })

    it('Confirm presence of Save IFC button post-login', () => {
      waitForModel()
      auth0Login()
      cy.findByTitle('Save', {timeout: 5000}).should('exist')
      cy.percySnapshot()
    })
  })

  context('Save model action', () => {
    it('Login, click Save IFC button, input details and save', () => {
      waitForModel()
      auth0Login()
      cy.findByTitle('Save', {timeout: 5000}).should('exist').click({force: true})
      cy.findByLabelText('Organization', {timeout: 5000}).click()
      cy.contains('@cypresstester').click()
      cy.findByLabelText('Repository', {timeout: 5000}).eq(0).click()
      cy.contains('test-repo').click()
      cy.findByLabelText('Enter file name').click().type('save-model-test.ifc')
      cy.contains('button', 'Save model').click()

      const animWaitTimeMs = 2000
      // eslint-disable-next-line cypress/no-unnecessary-waiting
      cy.wait(animWaitTimeMs)
      cy.percySnapshot()
    })
  })
})
