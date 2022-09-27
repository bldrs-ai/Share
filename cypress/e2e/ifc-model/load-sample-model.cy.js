describe('sample models', () => {
  context('when no model is loaded', () => {
    it('should display tooltip when hovering', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('form').findByRole('button', {name: /Open IFC/}).realHover()
      cy.findByRole('tooltip').contains('Open IFC')
    })

    it('should display the sample models dialog', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('form').findByRole('button', {name: /Open IFC/}).realClick()
      cy.findByRole('dialog')
    })

    it('should load the Momentum model when selected', () => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('form').findByRole('button', {name: /Open IFC/}).realClick()
      cy.findByRole('button', {name: /Sample Projects/}).realClick()
      cy.findByRole('listbox').within(() => {
        cy.findByRole('option', {name: /Momentum/}).realClick()
      })
      cy.findByRole('tree', {label: /IFC Navigator/})
      cy.findByText('Momentum / KNIK v3', {timeout: 10000})
    })
  })
})
