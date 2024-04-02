import {waitForModel, homepageSetup} from '../../support/utils'


describe('access-notes-list', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    /** Helper to close About. */
    beforeEach(() => {
      waitForModel()
      homepageSetup()
      cy.get('[data-testid="Notes"]')
          .click()
    })
    it('A list of notes to be visible)', () => {
      cy.get('.MuiList-root')
    })
    it('should display Notes navbar title', () => {
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
  })
})
