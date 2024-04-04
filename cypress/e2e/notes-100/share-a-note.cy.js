import {waitForModel, homepageSetup} from '../../support/utils'


describe('access-notes-list', () => {
  context('Open the model and access the list of notes', () => {
    beforeEach(() => {
      homepageSetup()
    })
    it('open sidedrawer when a note is shared', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48;i:')
      waitForModel()
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
  })
})
