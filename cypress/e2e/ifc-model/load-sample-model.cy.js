describe('sample models', () => {
  context('when no model is loaded', () => {
    it('should display tooltip when hovering', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('form').findByRole('button', {name: /Open IFC/, timeout: 5000}).realHover()
      cy.findByRole('tooltip').contains('Open IFC')
    })

    it('should display the sample models dialog', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.findByRole('dialog')
      cy.get('form').findByRole('button', {name: /Open IFC/, timeout: 5000}).realClick()
    })

    it('should load the Momentum model when selected', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('form').findByRole('button', {name: /Open IFC/, timeout: 5000}).realClick()
      cy.findByRole('button', {name: /Sample Projects/}).realClick()
      cy.findByRole('listbox').within(() => {
        cy.findByRole('option', {name: /Momentum/}).realClick()
      })
      cy.findByRole('listbox').should('not.exist')
      cy.findByRole('tree', {label: /IFC Navigator/})
      cy.findByText('Momentum / KNIK v3', {timeout: 5000})
    })
  })
})
