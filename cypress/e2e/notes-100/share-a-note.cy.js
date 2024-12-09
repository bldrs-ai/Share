import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1071} */
describe('Notes-100: Share a note', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes > first note, click share in note footer', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="list-notes"] [data-testid="note-body"]').first().click()

        cy.window().then((win) => {
          cy.stub(win.navigator.clipboard, 'writeText').as('clipboardSpy')
            .resolves()
        })
        cy.get('.MuiCardActions-root [data-testid="Share"] > .icon-share').first().click()
      })

      it('Link copied, SnackBar reports that - Screen', () => {
        cy.get('@clipboardSpy').should('have.been.calledOnce')
        cy.get('@clipboardSpy').then((stub) => {
          const clipboardText = stub.getCall(0).args[0] // Retrieve the first argument of the first call
          const url = new URL(clipboardText)
          expect(url.pathname).to.eq('/share/v/p/index.ifc')
          expect(url.hash).to.eq('#c:-73.467,127.432,94,-27.69,7.071,1.331;i:126')
        })

        cy.get('[data-testid="snackbar"]').contains('The url path is copied to the clipboard')
        cy.percySnapshot()
      })
    })
  })
})
