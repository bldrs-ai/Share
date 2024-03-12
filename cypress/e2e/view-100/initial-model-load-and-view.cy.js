describe('initial-model-load-and-view', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
    })

    it('See model centered in page (first-time)', () => {
      cy.visit('/')
      cy.get('button[aria-label="action-button"]')
          .click()
      // cy.findByTestId('open-model-button')
      //    .click()
      // cy.findByTestId('main-dialog').should('exist')
      // get('button[aria-label="action-button"]').contains('Sample Projects')
      cy.findByTestId('open-model-button') // to wait
      cy.percySnapshot()
    })

    it.skip('Title should contain function followed by location path', () => {
      cy.title().should('eq', '<Function> - <Model>/<Repo>/<Org>')
    })
  })
})

