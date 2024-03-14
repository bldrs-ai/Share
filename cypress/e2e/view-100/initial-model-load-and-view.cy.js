describe('initial-model-load-and-view', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    /** Helper to close About. */
    function waitForModel() {
      cy.get('#viewer-container').get('canvas').should('be.visible')
      const reqSuccessCode = 200
      cy.wait('@loadModel').its('response.statusCode').should('eq', reqSuccessCode)
      cy.get('[data-model-ready="true"]').should('exist', {timeout: 5000})
      cy.get('[data-is-camera-at-rest="true"]').should('exist', {timeout: 5000})
    }

    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
      cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'}).as('loadModel')
      // Must call waitForModel after this
    })

    it('See model centered in page (cookie isFirstTime: undefined)', () => {
      cy.visit('/')
      waitForModel()
      // Close About
      cy.get('button[aria-label="action-button"]')
          .click()
      cy.screenshot()
    })

    it('See model centered in page (cookie isFirstTime: 1)', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      waitForModel()
      cy.screenshot()
    })

    it.skip('Title should contain function followed by location path', () => {
      cy.title().should('eq', '<Function> - <Model>/<Repo>/<Org>')
    })
  })
})
