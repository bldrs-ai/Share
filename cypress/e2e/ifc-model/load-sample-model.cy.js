describe('sample models', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('#viewer-container').get('canvas').should('be.visible')
    })

    it('should display tooltip when hovering', () => {
      cy.get('form').findByRole('button', {name: /Open IFC/, timeout: 5000}).realHover()
      cy.findByRole('tooltip').contains('Open IFC')
    })

    it('should display the sample models dialog', () => {
      cy.get('form').findByRole('button', {name: /Open IFC/, timeout: 5000}).realClick()
      cy.findByRole('dialog').contains('Sample Projects')
    })

    it('should load the Momentum model when selected', () => {
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
