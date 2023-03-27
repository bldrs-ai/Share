describe('Navigation E2E test suite', () => {
  context('can toggle navigation mode', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
    })

    it('can toggle navigation tree', () => {
      cy.findByLabelText('spatial-tree').should('exist')
      cy.findByLabelText('element-types').should('exist')
      cy.findByLabelText('IFC Navigator').should('exist')
      cy.findByLabelText('IFC Types Navigator').should('not.exist')
      cy.findByLabelText('element-types').click()
      cy.findByLabelText('IFC Navigator').should('not.exist')
      cy.findByLabelText('IFC Types Navigator').should('exist')
    })
  })
})
