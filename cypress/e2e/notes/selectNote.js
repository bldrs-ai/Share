describe('select a note', () => {
  context('select a note from the notes list in the side drawer', () => {
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
    it('select the note with a title', () => {
      cy.get('.MuiList-root')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2').click()
      cy.get('[data-testid="panelTitle"]').contains('NOTE')
      cy.get(':nth-child(1) > [data-testid="selectionContainer"] > .MuiCardContent-root > p').contains('Local issue 2')
      cy.get(':nth-child(2) > .MuiCardContent-root > p').contains('Test Comment 1')
    })
  })
})
