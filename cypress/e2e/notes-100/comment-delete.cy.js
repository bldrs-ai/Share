import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1187} */
describe('Notes 100: Comment delete', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes > first note', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="list-notes"] :nth-child(1) > [data-testid="note-body"]').first().click()
      })
      it('Deleted comment disappears from the list', () => {
        auth0Login()
        cy.get(`[data-testid="list-notes"] > :nth-child(3)
        > [data-testid="note-card"] > .MuiCardActions-root > .MuiBox-root > [data-testid="deleteComment"]`).click()
        cy.get('[data-testid="list-notes"] > :nth-child(3) > [data-testid="note-card"]').should('not.contain', 'testComment_1')
        cy.percySnapshot()
      })
    })
  })
})
