describe('Notes contain GitHub link', () => {
  context('notes panel with notes list is visible in the side drawer', () => {
    beforeEach(() => {
      cy.clearCookies()
      cy.visit('/')
      cy.get('.MuiIconButton-root').click()
      cy.get('.MuiSnackbar-root > .MuiPaper-root').should('not.exist')
      cy.get('[data-testid="Notes"]').click()
    })
    it('should display Notes navbar title', () => {
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
    it('should display notes list', () => {
      cy.get('.MuiList-root')
    })
    it('select the note with a title and check for GitHub link', () => {
      cy.get('.MuiList-root')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2').click()
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2')
      cy.get(':nth-child(1) > .css-24km69 > .css-1yae3jf > [data-testid="Open in Github"]')
    })
  })
})
