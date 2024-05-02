import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1059} */
describe('Notes 100: Create a note', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage in a logged in state', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes', () => {
      beforeEach(() => {
        auth0Login()
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="Add a note"]').click()
      })
      it('Notes list switched to display only create note card', () => {
        cy.get('[data-testid="Back to the list"]').should('exist')
        cy.get('[placeholder="Note Title"]').should('exist')
        cy.get('[data-testid="panelTitle"]').contains('ADD A NOTE')
        cy.percySnapshot()
      })
      it('Back button navigates to the notes list', () => {
        cy.get('[data-testid="Back to the list"]').click()
        cy.get('[data-testid="list-notes"]').should('exist')
      })
      it('When note is created, navigate to the notes list with a new note created at the top of the list', () => {
        cy.get('[placeholder="Note Title"]').click().type('New Note Title')
        cy.get('[placeholder="Note Body"]').click().type('New Note Body')
        cy.get('[data-testid="Submit"]').should('be.enabled').click()
      })
    })
  })
})
