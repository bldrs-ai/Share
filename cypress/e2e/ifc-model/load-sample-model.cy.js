describe('sample models', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('#viewer-container').get('canvas').should('be.visible')

      // Wait up to 15 seconds for IFC to finish loading
      cy.get('[data-model-ready="true"]', {timeout: 300000}).should('exist')
    })

    it('should display tooltip when hovering', () => {
      cy.findByRole('button', {name: 'Open IFC', timeout: 300000}).realHover()
      cy.findByRole('tooltip', {timeout: 300000}).contains('Open IFC')
    })

    it('should display the sample models dialog', () => {
      cy.findByRole('button', {name: 'Open IFC', timeout: 300000}).realClick()
      cy.findByRole('dialog', {timeout: 300000}).contains('Sample Projects')
    })

    it('should load the Momentum model when selected', () => {
      cy.findByRole('button', {name: 'Open IFC', timeout: 300000}).realClick()
      cy.findByLabelText('Sample Projects').realClick()
      cy.findByRole('listbox', {timeout: 300000}).within(() => {
        cy.findByRole('option', {name: 'Momentum', timeout: 300000}).realClick()
      })
      cy.findByRole('listbox', {timeout: 300000}).should('not.exist')
      cy.findByRole('tree', {label: 'IFC Navigator', timeout: 300000})
      cy.findByText('Momentum / KNIK v3', {timeout: 300000})
    })
  })
})
