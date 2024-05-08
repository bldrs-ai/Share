import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'

/** {@link https://github.com/orgs/bldrs-ai/projects/50/views/1?pane=issue&itemId=52262146} */
describe('Notes 100: Comments on a note', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes > first note', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="list-notes"] :nth-child(1) > [data-testid="note-body"]').first().click()
      })
      it('Please login message to be visible', () => {
        // The list of notes is updated to display only the selected note with a comment input card visible
        cy.get('.MuiCardHeader-title').contains('issueTitle_4')
      })
      it('Create a comment card to be visible', () => {
        // The list of notes is updated to display only the selected note with a comment input card visible
        auth0Login()
        cy.get('[data-testid="note-body"]').contains('Leave a comment ...')
      })
    })
  })
})
