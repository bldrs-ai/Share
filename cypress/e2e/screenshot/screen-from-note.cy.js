describe('Note screenshot', () => {
  context('enable/disable feature using url parameter', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
    })

    it.skip('should not show screenshot button when url param not present', () => {
      cy.findByRole('button', {name: /Take Screenshot/}).should('not.exist')
    })

    it.skip('should show screenshot when url param present', () => {
      cy.visit('/share/v/p/index.ifc?feature=screenshot')
      cy.get('[title="Notes"]').click()
      cy.get('button[title="Take Screenshot"]').should('exist')
    })
  })
})
