import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


/** @see https://github.com/bldrs-ai/Share/issues/1071 */
describe('notes-100: Share a note', () => {
  beforeEach(homepageSetup)

  context('Visit model', () => {
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
    })

    context('Open notes, select first', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="panelTitle"]').contains('NOTES')
        cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root')
          .contains('Test Issue body')
          .click()
        cy.get('.MuiCardHeader-title').contains('Local issue 2')
      })

      context('Click share in note footer', () => {
        beforeEach(() => {
          cy.window().then((win) => {
            cy.stub(win.navigator.clipboard, 'writeText').as('clipboardSpy')
              .resolves()
          })
          cy.get('.MuiCardActions-root > [data-testid="Share"] > .icon-share').click()
          cy.get('@clipboardSpy').should('have.been.calledOnce')
        })

        it('SnackBar informs link copied - Screen', () => {
          cy.get('.MuiSnackbarContent-message > .css-1xhj18k').contains('The url path is copied to the clipboard')
          cy.percySnapshot()
        })

        it('Link has model path, issue id, current camera', () => {
          cy.get('@clipboardSpy').then((stub) => {
            const clipboardText = stub.getCall(0).args[0] // Retrieve the first argument of the first call
            const url = new URL(clipboardText)
            expect(url.pathname).to.eq('/share/v/p/index.ifc')
            expect(url.hash).to.eq('#c:-26.91,28.84,112.47,-22,16.21,-3.48;i:2')
          })
        })
      })
    })
  })
})
