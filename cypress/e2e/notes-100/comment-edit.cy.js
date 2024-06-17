import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1186} */
describe('Notes 100: Comment edit', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes > First note --', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="list-notes"] :nth-child(1) > [data-testid="note-body"]').first().click()
        auth0Login()
      })
      it('Edit button should be visible', () => {
        cy.get(`[data-testid="list-notes"] > :nth-child(3)
        > [data-testid="note-card"] > .MuiCardActions-root > .MuiBox-root > [data-testid="editComment"]`)
        cy.percySnapshot()
      })
      it('Comment switches to edit mode', () => {
        cy.get(`[data-testid="list-notes"] > :nth-child(3)
        > [data-testid="note-card"] > .MuiCardActions-root > .MuiBox-root > [data-testid="editComment"]`).click()
        cy.get('[data-testid="Save"]')
        cy.percySnapshot()
      })
      it('Comment displays updated body', () => {
        cy.get(`[data-testid="list-notes"] > :nth-child(3)
        > [data-testid="note-card"] > .MuiCardActions-root > .MuiBox-root > [data-testid="editComment"]`).click()
        cy.get('[placeholder="Note body"]').click().type('updated body')
        cy.get('[data-testid="Save"]').click()
        // eslint-disable-next-line cypress/no-unnecessary-waiting, no-magic-numbers
        cy.wait(1000)
        cy.percySnapshot()
      })
    })
  })
})
