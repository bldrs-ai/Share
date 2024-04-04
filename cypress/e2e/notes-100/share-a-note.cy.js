import {waitForModel, homepageSetup} from '../../support/utils'


describe('share-a-note', () => {
  context('Open the model and access the list of notes', () => {
    beforeEach(() => {
      homepageSetup()
    })

    it('open sidedrawer when a note is shared and copy the link', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      waitForModel()

      cy.get('[data-testid="Notes"]').click()
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('Test Issue body').click()
      cy.get('.MuiCardHeader-title').contains('Local issue 2')

      cy.window().then((win) => {
        cy.spy(win.navigator.clipboard, 'writeText').as('clipboardSpy')
      })

      cy.get('.MuiCardActions-root > [data-testid="Share"] > .icon-share').click()

      // Now, verify that the clipboardSpy was called
      cy.get('@clipboardSpy').should('have.been.calledOnce')

      cy.get('.MuiSnackbarContent-message > .css-1xhj18k').contains('The url path is copied to the clipboard')
    })
  })
})
