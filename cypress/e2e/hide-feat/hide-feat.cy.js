describe('Ifc Hide/Unhide E2E test suite', () => {
  context('Hide icon toggle', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
    })

    it('should toggle hide icon when clicked', () => {
      cy.findByRole('tree', {label: 'IFC Navigator'}).click()
      cy.findByTestId('hide-icon').should('exist')
      cy.findByTestId('hide-icon').should('have.attr', 'data-icon', 'eye')
      cy.findByTestId('hide-icon').click()
      cy.findByTestId('hide-icon').should('have.attr', 'data-icon', 'eye-slash')
    })
  })
})
