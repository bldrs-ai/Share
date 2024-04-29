import '@percy/cypress'
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
        cy.get('[data-testid="list-notes"] > :nth-child(2) > [data-testid="note-card"] p').contains('testComment_1')
        cy.get('[data-testid="list-notes"] > :nth-child(3) > [data-testid="note-card"] p').contains('testComment_2')

        cy.get('[data-testid="panelTitle"]').should('have.text', 'NOTE')

        cy.get('[data-testid="Back to the list"]')

        cy.percySnapshot()
      })
    })
  })
})
