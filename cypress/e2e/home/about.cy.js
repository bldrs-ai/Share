import {
  ABOUT_MISSION,
  ABOUT_PAGE_TITLE,
} from '../../../src/Components/About/component'


/** {@link https://github.com/bldrs-ai/Share/issues/1285}*/
describe('About', () => {
  context('First-time user visits homepage', () => {
    before(() => {
      cy.clearCookies()
      cy.visit('/')
    })
    it('about dialog is displayed', () => {
      cy.findByRole('dialog')
        .should('exist')
        .should('be.visible')
        .contains(ABOUT_MISSION)
      cy.title().should('eq', ABOUT_PAGE_TITLE)
    })
  })
  context('Returning use visits homepage', () => {
    before(() => {
      cy.setCookie('isFirstTime', '1')
      cy.visit('/')
    })
    it('about dialog is not displayed', () => {
      cy.findByRole('dialog', {timeout: 300000})
          .should('not.exist')
    })
  })
})
