describe('Note_Contains_link_to_Github_issue', () => {
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
      cy.visit('/')
      waitForModel()
      // Close About
      cy.get('button[aria-label="action-button"]')
          .click()
      // Click on Notes button
      cy.get('[data-testid="Notes"]')
          .click()
      cy.get('.MuiList-root')
    })
    it('A note contains a link to github issue', () => {
      cy.get('[data-testid="Notes"]')
      cy.get('[data-testid="Open in Github"]')
    })
    it('A note contains a link to github issue, when selected', () => {
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('Test Issue body').click()
      cy.get('.MuiCardHeader-title').contains('Local issue 2')
      cy.get('[data-testid="Open in Github"]')
    })
  })
})
