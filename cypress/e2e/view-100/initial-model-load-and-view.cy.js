import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../../support/utils'


// From https://github.com/bldrs-ai/Share/issues/1031
describe('view 100: Initial model load and view', () => {
  beforeEach(homepageSetup)

  context('setIsReturningUser', () => {
    beforeEach(setIsReturningUser)

    context('visitHomepageWaitForModel', () => {
      beforeEach(visitHomepageWaitForModel)

      it('See logo model, model title and all main controls - SCREEN', () => {
        cy.title().should('eq', 'index.ifc - Share/pablo-mayrgundter')

        cy.get('[data-testid="control-button-open"]').should('exist')
        cy.get('[data-testid="control-button-navigation"]').should('exist')
        cy.get('[data-testid="control-button-search"]').should('exist')
        cy.get('[data-testid="control-button-profile"]').should('exist')
        cy.get('[data-testid="control-button-share"]').should('exist')
        cy.get('[data-testid="control-button-notes"]').should('exist')
        cy.get('[data-testid="control-button-rendering"]').should('exist')
        cy.get('[data-testid="control-button-help"]').should('exist')
        cy.get('[data-testid="control-button-section"]').should('exist')
        cy.get('[data-testid="control-button-about"]').should('exist')

        cy.percySnapshot()
      })
    })

    context('Visit about permalink waitForModel', () => {
      beforeEach(() => {
        cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;about:')
        waitForModel()
      })

      it('See About dialog - SCREEN', () => {
        cy.get('[data-testid="about-dialog"]').should('exist')
        cy.title().should('eq', 'About — bldrs.ai')
        cy.percySnapshot()
      })
    })
  })


  context('Is first-time user', () => {
    // No beforeEach, isFirstTime cookie remains unset

    context('visitHomepageWaitForModel', () => {
      beforeEach(visitHomepageWaitForModel)

      it('AboutDialog visible - SCREEN', () => {
        cy.get('[data-testid="about-dialog"]').should('exist')
        cy.percySnapshot()
      })

      context('user closes about dialog', () => {
        beforeEach(() => {
          cy.get('[data-testid="about-dialog"]').should('exist')
          // Close About
          cy.get('button[aria-label="action-button"]')
            .click()
        })

        it('Model visible - SCREEN', () => {
          cy.get('body').find('[data-testid="about-dialog"]').should('not.exist')
          cy.percySnapshot()
        })
      })
    })
  })
})
