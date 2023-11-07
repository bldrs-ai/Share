describe('Ifc Hide/Unhide E2E test suite', () => {
  context('Hide icon toggle', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
    })

    it('should toggle hide icon when clicked', () => {
      cy.findByTestId('Navigation').click()
      cy.findByLabelText('Navigation Panel').click()
      cy.findByTestId('hide-icon').should('exist')
      cy.findByTestId('hide-icon').click()
      cy.findByTestId('unhide-icon').should('exist')
      cy.findByTestId('hide-icon').should('not.exist')
    })
  })
})
