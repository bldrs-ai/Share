describe('initial-model-load-and-view', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    const ANIM_WAIT_TIME_MS = 1000

    /** Helper to close About. */
    function onFirstLoadCloseAbout() {
      cy.get('#viewer-container').get('canvas').should('be.visible')
      const reqSuccessCode = 200
      cy.wait('@loadModel').its('response.statusCode').should('eq', reqSuccessCode)
      cy.get('[data-model-ready="true"]').should('exist', {timeout: 10000})
    }

    beforeEach(() => {
      cy.clearLocalStorage()
      cy.clearCookies()
      cy.intercept('GET', '/index.ifc', {fixture: 'index.ifc'}).as('loadModel')
    })

    it('See model centered in page (cookie isFirstTime: undefined)', () => {
      cy.visit('/')
      onFirstLoadCloseAbout()
      // TODO(pablo): model animation takes time to settle
      // eslint-disable-next-line cypress/no-unnecessary-waiting
      cy.wait(ANIM_WAIT_TIME_MS)
      cy.screenshot()
    })

    it('See model centered in page (cookie isFirstTime: 1)', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      onFirstLoadCloseAbout()
      // TODO(pablo): model animation takes time to settle
      // eslint-disable-next-line cypress/no-unnecessary-waiting
      cy.wait(ANIM_WAIT_TIME_MS)
      cy.screenshot()
    })

    it.skip('Title should contain function followed by location path', () => {
      cy.title().should('eq', '<Function> - <Model>/<Repo>/<Org>')
    })
  })
})
