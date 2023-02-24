describe('home page', () => {
  context('without a first-time visit value', () => {
    it('should display the about dialog', () => {
      cy.clearCookies()
      cy.visit('/')
      cy.findByRole('dialog', {timeout: 300000})
          .should('exist')
          .should('be.visible')
          .contains('build every thing together')
      cy.title().should('eq', 'About — BLDRS')
    })
  })

  context('with a false first-time visit cookie', () => {
    it('should NOT display the about dialog', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.findByRole('dialog', {timeout: 300000})
          .should('not.exist')
    })
  })
})
