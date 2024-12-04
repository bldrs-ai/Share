describe('apps side drawer', () => {
  context('enable/disable feature using url parameter', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
    })

    it('should not show apps icon when url parameter is not present', () => {
      cy.findByRole('button', {name: /Open Apps/}).should('not.exist')
    })

    it.skip('should show apps icon when url parameter is present', () => {
      cy.routerNavigate('/share/v/p?feature=apps', {replace: true})
      cy.findByRole('button', {name: /Open Apps/}).should('exist')
    })
  })
})
