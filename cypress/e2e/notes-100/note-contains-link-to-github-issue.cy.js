import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1056} */
describe('Notes 100: Note contains link to GitHub', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes', () => {
      beforeEach(() => cy.get('[data-testid="control-button-notes"]').click())
      it('Github link is visible on a note card in the list - Screen', () => {
        cy.get('[data-testid="Open in Github"]')
        cy.percySnapshot()
      })
      context('Open first note', () => {
        beforeEach(() => cy.get(`
        [data-testid="list-notes"]
        :nth-child(1) > [data-testid="note-card"] > [data-testid="note-body"]`).first().click())
        it('Github link is visible on a note card when the note selected - Screen', () => {
          cy.get('.MuiCardHeader-title').contains('issueTitle_4')
          cy.get('[data-testid="Open in Github"]')
          cy.get('[data-testid="list-notes"] > :nth-child(4) > [data-testid="note-card"] p').contains('testComment_1')
          // eslint-disable-next-line cypress/no-unnecessary-waiting, no-magic-numbers
          cy.wait(1000)
          cy.percySnapshot()
        })
      })
    })
  })
})
