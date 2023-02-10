describe('sample models', () => {
  const REMOTE_IFC_URL = '**/Momentum.ifc'
  const REMOTE_IFC_FIXTURE = 'TestFixture.ifc'
  const REQUEST_SUCCESS_CODE = 200

  context('when no model is loaded', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
      cy.get('#viewer-container').get('canvas').should('be.visible')
      cy.get('[data-model-ready="true"]').should('exist')
    })

    it('should display tooltip when hovering', () => {
      cy.findByRole('button', {name: 'Open IFC'}).realHover()
      cy.findByRole('tooltip').contains('Open IFC')
    })

    it('should display the sample models dialog', () => {
      cy.findByTestId('open-ifc').realClick()
      cy.findByRole('dialog').contains('Sample Projects')
    })

    it('should load the Momentum model when selected', () => {
      cy.findByTestId('open-ifc').realClick()
      cy.findByLabelText('Sample Projects').realClick()
      cy.intercept('GET', REMOTE_IFC_URL, {fixture: REMOTE_IFC_FIXTURE}).as('loadModel')
      cy.findByRole('listbox').within(() => {
        cy.findByRole('option', {name: 'Momentum'}).realClick()
        cy.wait('@loadModel').its('response.statusCode').should('eq', REQUEST_SUCCESS_CODE)
      })
      cy.findByRole('listbox').should('not.exist')
      cy.findByRole('tree', {label: 'IFC Navigator'})
      cy.findByText('Proxy with extruded box')
    })
  })
})
