import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'

<<<<<<< HEAD
/** {@link https://github.com/bldrs-ai/Share/issues/1056} */
describe('Notes 100: Note contains link to GitHub', () => {
=======

describe('Notes 100: Select a note', () => {
>>>>>>> 8add23a5 (revert github test)
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
        beforeEach(() => cy.get('[data-testid="list-notes"] :nth-child(1) > [data-testid="note-body"]').first().click())
        it('Github link is visible on a note card when the note selected - Screen', () => {
          cy.get('.MuiCardHeader-title').contains('issueTitle_4')
          cy.get('[data-testid="Open in Github"]')
          cy.percySnapshot()
        })
      })
    })
  })
})
