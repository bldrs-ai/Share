import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/978} */
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
        cy.get('.MuiCardHeader-title').contains('issueTitle_4')
        cy.percySnapshot()
      })
      it('Create a comment card to be visible', () => {
        auth0Login()
        cy.get('[placeholder="Leave a comment ..."]')
        cy.percySnapshot()
      })
      it('Allows writing over 256 characters in the comment box', () => {
        auth0Login()
        // eslint-disable-next-line no-magic-numbers
        const longText = 'a'.repeat(300) // 300 characters
        cy.get('[placeholder="Leave a comment ..."]')
          .type(longText)
          .should('have.value', longText) // Assert that the textbox contains the long input
        cy.percySnapshot()
      })
    })
  })
})
