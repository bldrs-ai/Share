import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepage,
  waitForModel,
} from '../../support/utils'


describe('view 100: Initial model load and view', () => {
  beforeEach(homepageSetup)

  context('Is first-time user', () => {
    // No beforeEach, isFirstTime cookie remains unset

    context('Visit homepage', () => {
      beforeEach(visitHomepage)

      it('See AboutDialog - SCREEN', () => {
        waitForModel()
        cy.get('[data-testid="about-dialog"]').should('exist')
        cy.percySnapshot()
      })

      it('AboutDialog closes and shows model - SCREEN', () => {
        waitForModel()
        cy.get('[data-testid="about-dialog"]').should('exist')
        // Close About
        cy.get('button[aria-label="action-button"]')
          .click()
        cy.title().should('eq', 'index.ifc - Share/pablo-mayrgundter')
        cy.percySnapshot()
      })
    })

    context('Visit about permalink', () => {
      beforeEach(() => cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;about:'))

      it('See About dialog - SCREEN', () => {
        waitForModel()
        cy.get('[data-testid="about-dialog"]').should('exist')
        cy.percySnapshot()
      })

      it('About dialog closes and shows model - SCREEN', () => {
        waitForModel()
        cy.get('[data-testid="about-dialog"]').should('exist')
        // Close About
        cy.get('button[aria-label="action-button"]')
          .click()
        cy.title().should('eq', 'index.ifc - Share/pablo-mayrgundter')
        cy.percySnapshot()
      })
    })
  })

  context('Is returning user', () => {
    beforeEach(setIsReturningUser)

    context('Visit homepage', () => {
      beforeEach(visitHomepage)

      it('See logo - SCREEN', () => {
        waitForModel()
        cy.percySnapshot()
      })
    })

    context('Visit about permalink', () => {
      beforeEach(() => cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;about:'))

      it('See About dialog  - SCREEN', () => {
        waitForModel()
        cy.title().should('eq', 'About — bldrs.ai')
        cy.percySnapshot()
      })
    })
  })
})
