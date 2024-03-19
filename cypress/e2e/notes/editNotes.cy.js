/* eslint-disable no-unused-expressions */
import {auth0Login, setPort, waitForModel} from '../../support/utils'


describe('edit a note', () => {
  context('notes panel with notes list is visible in the side drawer', () => {
    beforeEach(() => {
      cy.clearCookies()
      cy.visit('/')
      cy.get('.MuiIconButton-root').click()
      cy.get('.MuiSnackbar-root > .MuiPaper-root').should('not.exist')
      cy.get('[data-testid="Notes"]').click()
    })
    it('Should Login', () => {
      cy.visit('/')
      // Now trigger the login process, which will use the mocked loginWithPopup
      cy.url().then((currentUrl) => {
        const url = new URL(currentUrl)
        setPort(url.port)
        waitForModel()
        auth0Login()
        // take screenshot
        cy.screenshot()
      })
    })
    it('should display Notes navbar title', () => {
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
    it('should display notes list', () => {
      cy.get('.MuiList-root')
    })

    it('select the note with a title', () => {
      cy.get('.MuiList-root')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2').click()
      cy.get('[data-testid="panelTitle"]').contains('NOTE')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2')
      cy.get(':nth-child(2) > .MuiCardContent-root > p').contains('Test Comment 1')
    })
    it('More menu to be visible in the title bar of the note', () => {
      cy.get('.MuiList-root')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2')
      '...menu should be visible'
    })
    it('Edit the note', () => {
      cy.get('.MuiList-root')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2')
      '...menu should be visible'
      'click on the menu'
      'edit button should be visible'
      'click on the edit button'
      'input component should be visible'
      'input sample string'
      'find click button'
    })
  })
})
