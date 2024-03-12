describe('initial-model-load-and-view', () => {
  // const REMOTE_IFC_URL = '**/Momentum.ifc'
  // const REMOTE_IFC_FIXTURE = 'TestFixture.ifc'
  // const REQUEST_SUCCESS_CODE = 200
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
    })

    it('See model centered in page (first-time)', () => {
      // cy.intercept('GET', REMOTE_IFC_URL, {fixture: REMOTE_IFC_FIXTURE}).as('loadModel')
      // cy.wait('@loadModel').its('response.statusCode').should('eq', REQUEST_SUCCESS_CODE)
      cy.visit('/')
      cy.get('button[aria-label="action-button"]')
          .click()
      // cy.findByTestId('open-model-button')
      //    .click()
      // cy.findByTestId('main-dialog').should('exist')
      // get('button[aria-label="action-button"]').contains('Sample Projects')
      cy.get('#viewer-container').get('canvas').should('be.visible')
      cy.get('[data-model-ready="true"]').should('exist')
      // cy.get('[data-model-ready="true"]').should('exist')
      // cy.percySnapshot()
    })

    it.skip('Title should contain function followed by location path', () => {
      cy.title().should('eq', '<Function> - <Model>/<Repo>/<Org>')
    })
  })
})

