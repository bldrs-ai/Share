import {waitForModel, homepageSetup} from '../../support/utils'


describe('select-a-note', () => {
  context('Open the link with a shared note', () => {
    beforeEach(() => {
      homepageSetup()
    })
    it('Visit notes permalink, side drawer shall be opened', () => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;i:')
      waitForModel()
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
  })
})
