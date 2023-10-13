describe('Ifc Hide/Unhide E2E test suite', () => {
  context('Hide icon toggle', () => {
    beforeEach(() => {
      cy.setCookie('isFirstTime', 'false')
      cy.visit('/')
    })

    it('should toggle hide icon when clicked', () => {
      cy.findByTestId('navigation-toggle').click()
      cy.findByLabelText('Navigation Panel').realHover()
      cy.findByTestId('hide-icon').should('exist')
      cy.findByTestId('hide-icon').click()
      cy.findByTestId('unhide-icon').should('exist')
      cy.findByTestId('hide-icon').should('not.exist')
    })
  })
})
