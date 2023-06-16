describe('appStore side drawer', () => {
  context('enable/disable feature using url parameter', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
    })

    it('should not show app-store icon when url parameter is not present', () => {
      cy.findByRole('button', {name: /Open App Store/}).should('not.exist')
    })

    it('should show app-store icon when url parameter is present', () => {
      cy.routerNavigate('/share/v/p?feature=apps', {replace: true})
      cy.findByRole('button', {name: /Open App Store/}).should('exist')
    })
  })
})
