import {waitForModel, homepageSetup} from '../../support/utils'


describe('initial-model-load-and-view', () => {
  context('Open model by following a link to a project on Share (e.g. our index.ifc)', () => {
    beforeEach(() => {
      homepageSetup()
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
