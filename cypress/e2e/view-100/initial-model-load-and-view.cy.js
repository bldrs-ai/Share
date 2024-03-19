describe('initial-model-load-and-view', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    /** Helper to close About. */
    function waitForModel() {
      cy.get('#viewer-container').get('canvas').should('be.visible')
      const reqSuccessCode = 200
      cy.wait('@loadModel').its('response.statusCode').should('eq', reqSuccessCode)
      cy.get('[data-model-ready="true"]').should('exist', {timeout: 1000})
      const animWaitTimeMs = 1000
      // eslint-disable-next-line cypress/no-unnecessary-waiting
      cy.wait(animWaitTimeMs)
      // TODO(pablo): ideally we just wait on anim rest event from
      // camera-controls lib, but only seems to work locally.
      // cy.get('[data-is-camera-at-rest="true"]').should('exist', {timeout: 1000})
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
