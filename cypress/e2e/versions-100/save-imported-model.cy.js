import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/980}*/
describe('Versions 100: Save model', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('Save button not visible',
       () => cy.findByTestId('Save', {timeout: 10000}).should('not.exist'))

    context('User login', () => {
      beforeEach(auth0Login)

      it('Save button visible, User inputs details and saves - Screens', () => {
        const percyLabelPrefix = 'Versions 100: Save Model,'
        cy.findByTitle('Save', {timeout: 5000}).should('exist')
        cy.percySnapshot(`${percyLabelPrefix} save button visible`)

        cy.findByTitle('Save', {timeout: 5000}).should('exist').click({force: true})
        cy.findByLabelText('Organization', {timeout: 5000}).click()
        cy.contains('@cypresstester').click()
        cy.findByLabelText('Repository', {timeout: 5000}).eq(0).click()
        cy.contains('test-repo').click()
        cy.findByLabelText('Enter file name').click().type('save-model-test.ifc')
        cy.percySnapshot(`${percyLabelPrefix} form filled`)

        cy.contains('button', 'Save model').click()
        const animWaitTimeMs = 2000
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(animWaitTimeMs)
        cy.percySnapshot(`${percyLabelPrefix} model visible after save`)
      })
    })
  })
})
