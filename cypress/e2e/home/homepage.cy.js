describe('home page', () => {
  context('without a first-time visit value', () => {
    it('should display the about dialog', () => {
      cy.clearCookies()
      cy.visit('/')
      cy.get('[data-testid=about-dialog').then(($el) => {
        expect($el).to.be.visible
      })
    })
  })

  context('with a false first-time visit cookie', () => {
    it('should NOT display the about dialog', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('[data-testid=about-dialog').should('not.exist')
    })
  })
})
