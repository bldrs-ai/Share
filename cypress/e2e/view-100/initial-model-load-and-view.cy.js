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

  context('Returning user', () => {
    beforeEach(setIsReturningUser)

    context('Visits homepage', () => {
      beforeEach(visitHomepageWaitForModel)

      // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
      it.skip('See logo model, model title and all main controls - Screen', () => {
        cy.title().should('eq', 'index.ifc - Share/pablo-mayrgundter')

        cy.get('[data-testid="control-button-open"]').should('exist')
        cy.get('[data-testid="control-button-navigation"]').should('exist')
        cy.get('[data-testid="control-button-search"]').should('exist')
        cy.get('[data-testid="control-button-profile"]').should('exist')
        cy.get('[data-testid="control-button-share"]').should('exist')
        cy.get('[data-testid="control-button-notes"]').should('exist')
        cy.get('[data-testid="control-button-rendering"]').should('exist')
        cy.get('[data-testid="control-button-help"]').should('exist')
        cy.get('[data-testid="control-button-cut-plane"]').should('exist')
        cy.get('[data-testid="control-button-about"]').should('exist')

        cy.percySnapshot()
      })
    })

    context('Visits about permalink', () => {
      beforeEach(() => {
        cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;about:')
        waitForModel()
      })

      it('See AboutDialog - Screen', () => {
        cy.get('[data-testid="about-dialog"]').should('exist')
        cy.title().should('eq', 'About — bldrs.ai')
        cy.percySnapshot()
      })
    })
  })


  context('First-time user', () => {
    // No beforeEach, isFirstTime cookie remains unset

    context('Visits homepage', () => {
      beforeEach(visitHomepageWaitForModel)

      it('See AboutDialog - Screen', () => {
        cy.get('[data-testid="about-dialog"]').should('exist')
        cy.percySnapshot()
      })

      context('Close about dialog', () => {
        beforeEach(() => {
          cy.get('[data-testid="about-dialog"]').should('exist')
          // Close About
          cy.get('button[aria-label="action-button"]')
            .click()
        })

        it('AboutDialog not visible, model visible - Screen', () => {
          cy.get('body').find('[data-testid="about-dialog"]').should('not.exist')
          cy.percySnapshot()
        })
      })
    })
  })
})
