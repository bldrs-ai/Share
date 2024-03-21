describe('initial-model-load-and-view', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    /** Helper to close About. */
    function waitForModel() {
      cy.get('#viewer-container').get('canvas').should('be.visible')
      const HTTP_OK = 200
      const HTTP_NOT_MODIFIED = 304 // ie it's cached
      cy.wait('@loadModel').its('response.statusCode').should((statusCode) => {
        expect([HTTP_OK, HTTP_NOT_MODIFIED]).to.include(statusCode)
      })
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
      // Must call waitForModel after this
      cy.intercept('GET', '/index.ifc').as('loadModel')
      cy.intercept('GET', '/share/v/p/index.ifc', {fixture: '404.html'}).as('bounce')
    })

    it('See model centered in page (cookie isFirstTime: 1)', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      waitForModel()
      cy.screenshot()
    })

    it('See model centered in page (cookie isFirstTime: undefined)', () => {
      cy.visit('/')
      waitForModel()
      // Close About
      cy.get('button[aria-label="action-button"]')
          .click()
      cy.title().should('eq', 'index.ifc - Share/pablo-mayrgundter')
      cy.screenshot()
    })

    it('Visit about permalink', () => {
      cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;about:')
      waitForModel()
      cy.title().should('eq', 'About — bldrs.ai')
      cy.screenshot()
    })

    it('Title should contain model followed by repo and org', () => {
      cy.visit('/')
      waitForModel()
    })
  })
})
