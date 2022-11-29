describe('sample models', () => {
  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('#viewer-container').get('canvas').should('be.visible')

      // Wait up to 15 seconds for IFC to finish loading
      cy.get('[data-model-ready="true"]', {timeout: 15000}).should('exist')
    })

    it('should display tooltip when hovering', () => {
      cy.findByRole('button', {name: 'Open IFC'}).realHover()
      cy.findByRole('tooltip').contains('Open IFC')
    })

    it('should display the sample models dialog', () => {
      cy.findByRole('button', {name: 'Open IFC'}).realClick()
      cy.findByRole('dialog').contains('Sample Projects')
    })

    it('should load the Momentum model when selected', () => {
      cy.findByRole('button', {name: 'Open IFC'}).realClick()
      cy.findByLabelText('Sample Projects').realClick()
      cy.findByRole('listbox').within(() => {
        cy.findByRole('option', {name: 'Momentum'}).realClick()
      })
      cy.findByRole('listbox').should('not.exist')
      cy.findByRole('tree', {label: 'IFC Navigator'})
      cy.findByText('Momentum / KNIK v3', {timeout: 5000})
    })
  })
})
