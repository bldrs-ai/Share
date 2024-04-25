
import {
  setIsReturningUser,
  homepageSetup,
  auth0Login,
} from '../../support/utils'


describe('edit a note', () => {
  context('User visits homepage in the logged-in state', () => {
    beforeEach(() => {
      homepageSetup()
      setIsReturningUser()
      cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
      auth0Login()
    })
    it('Correct project to be loaded into the viewport and side drawer to be open - Screen', () => {
      // cy.get('[data-testid="panelTitle"]').contains('NOTES')
      })
  })
})
