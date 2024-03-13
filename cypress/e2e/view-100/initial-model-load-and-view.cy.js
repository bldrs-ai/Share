describe('initial-model-load-and-view', () => {
  const REMOTE_IFC_URL = '/index.ifc'
  const REMOTE_IFC_FIXTURE = 'index.ifc'
  const REQUEST_SUCCESS_CODE = 200
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
    })

    it('See model centered in page (first-time)', () => {
      cy.intercept('GET', REMOTE_IFC_URL, {fixture: REMOTE_IFC_FIXTURE}).as('loadModel')
      cy.visit('/')
      cy.get('#viewer-container').get('canvas').should('be.visible')
      cy.get('button[aria-label="action-button"]')
          .click()
      cy.wait('@loadModel').its('response.statusCode').should('eq', REQUEST_SUCCESS_CODE)
      cy.get('[data-model-ready="true"]').should('exist', {timeout: 10000})
      // TODO(pablo): figure out screen regression check
      // cy.percySnapshot()
    })

    it.skip('Title should contain function followed by location path', () => {
      cy.title().should('eq', '<Function> - <Model>/<Repo>/<Org>')
    })
  })
})

