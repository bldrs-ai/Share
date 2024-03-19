describe('access notes list', () => {
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
  })
})
