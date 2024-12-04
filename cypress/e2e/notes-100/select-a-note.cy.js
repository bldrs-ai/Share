import '@percy/cypress'
import {TITLE_NOTE} from '../../../src/Components/Notes/component'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1055} */
describe('Notes 100: Select a note', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes > first note', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="list-notes"] :nth-child(1) > [data-testid="note-body"]').first().click()
      })
      it('Shows title, comments and new nav state', () => {
        // The list of notes is updated to display only the selected note
        cy.get('.MuiCardHeader-title').contains('issueTitle_4')

        // A list of comments attached to the note to be visible
        cy.get('[data-testid="list-notes"] > :nth-child(4) > [data-testid="note-card"] p').contains('testComment_1')
        cy.get('[data-testid="list-notes"] > :nth-child(5) > [data-testid="note-card"] p').contains('testComment_2')

        cy.get(`[data-testid="PanelTitle-${TITLE_NOTE}"]`).debug()

        cy.get(`[data-testid="PanelTitle-${TITLE_NOTE}"]`).should('have.text', TITLE_NOTE)

        cy.get('[data-testid="Back to the list"]').click()

        // Ensure we navigate back to the full list of notes
        cy.get('[data-testid="list-notes"]').should('exist')
        cy.get('[data-testid="list-notes"] :nth-child(1) > [data-testid="note-body"]').should('exist')

        cy.percySnapshot()
      })
    })
  })
})
