describe('home page', () => {
  context('without a first-time visit value', () => {
    it('should display the about dialog', () => {
      cy.clearCookies()
      cy.visit('/')
      cy.findByRole('dialog')
          .should('exist')
          .should('be.visible')
          .contains('Build Every Thing Together')
    })
  })

  context('with a false first-time visit cookie', () => {
    it('should NOT display the about dialog', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.findByRole('dialog')
          .should('not.exist')
    })
  })
})
