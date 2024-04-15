import {waitForModel, homepageSetup} from '../../support/utils'


describe('access-notes-list', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    beforeEach(() => {
      homepageSetup()
    })
    it('A list of notes to be visible)', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get('.MuiList-root')
    })
    it('should display Notes navbar title', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
  })
})
