import '@percy/cypress'
import {TITLE_NOTE_ADD} from '../../../src/Components/Notes/component'
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
      it('Notes list switches to display only create note card and back to the list when nav backbutton is pressed', () => {
        cy.get('[data-testid="Back to the list"]').should('exist')
        cy.get('[placeholder="Note Title"]').should('exist')
        cy.get(`[data-testid="PanelTitle-${TITLE_NOTE_ADD}"]`).contains(TITLE_NOTE_ADD)
        cy.percySnapshot()
        cy.get('[data-testid="Back to the list"]').click()
        cy.get('[data-testid="list-notes"]').should('exist')
      })
      // TODO(oleg): the final check with the created note appended to the top of the list
      // will be implemented when Pablo finishes the github store mock
      it('When note is created, navigate to the notes list with a new note created at the top of the list', () => {
        cy.get('[placeholder="Note Title"]').click().type('New Note Title')
        cy.get('[placeholder="Note Body"]').click().type('New Note Body')
        cy.get('[data-testid="Submit"]').should('be.enabled')
        cy.get('[data-testid="Submit"]').click()
        cy.get('[data-testid="list-notes"]').should('exist')
        cy.get('.MuiCardHeader-title').contains('issueTitle_4')
        cy.percySnapshot()
      })
    })
  })
})
