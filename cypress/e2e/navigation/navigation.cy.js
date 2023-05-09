describe('Navigation E2E test suite', () => {
  context('can toggle navigation mode', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/', {
        qs: {
          feature: 'navTypes',
        },
      })
    })

    it.skip('can toggle navigation tree', () => {
      cy.findByLabelText('spatial-tree').should('not.be.visible')
      cy.findByLabelText('element-types').should('not.be.visible')
      cy.findByLabelText('Navigation Panel').realHover()
      cy.findByLabelText('spatial-tree').should('be.visible')
      cy.findByLabelText('element-types').should('be.visible')
      cy.findByLabelText('IFC Navigator').should('exist')
      cy.findByLabelText('IFC Types Navigator').should('not.exist')
      cy.findByLabelText('element-types').realClick()
      cy.findByLabelText('IFC Navigator').should('not.exist')
      cy.findByLabelText('IFC Types Navigator').should('exist')
    })
  })
})
