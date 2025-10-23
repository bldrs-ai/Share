import '@percy/cypress'
import {ABOUT_MISSION} from '../../../src/Components/About/component'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../../support/utils'


// From https://github.com/bldrs-ai/Share/issues/1031
describe.skip('view 100: Initial model load and view', () => {
  beforeEach(homepageSetup)

  context('Returning user', () => {
    beforeEach(setIsReturningUser)

    context('Visits homepage', () => {
      beforeEach(visitHomepageWaitForModel)

      // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
      it('See logo model, model title and all main controls - Screen', () => {
        cy.title().should('eq', 'index.ifc - Share/pablo-mayrgundter')

        cy.getByTestId('control-button-open').should('exist')
        cy.getByTestId('control-button-navigation').should('exist')
        cy.getByTestId('control-button-search').should('exist')
        cy.getByTestId('control-button-profile').should('exist')
        cy.getByTestId('control-button-share').should('exist')
        cy.getByTestId('control-button-notes').should('exist')
        cy.getByTestId('control-button-rendering').should('exist')
        cy.getByTestId('control-button-help').should('exist')
        cy.getByTestId('control-button-cut-plane').should('exist')
        cy.getByTestId('control-button-about').should('exist')

        cy.percySnapshot()
      })
    })

    context('Visits about permalink', () => {
      beforeEach(() => {
        cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;about:')
        waitForModel()
      })

      it('See AboutDialog - Screen', () => {
        cy.getByTestId(DIALOG_ID).should('exist')
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
        cy.getByTestId(DIALOG_ID).should('exist')
        cy.percySnapshot()
      })

      context('Close about dialog', () => {
        beforeEach(() => {
          cy.getByTestId(DIALOG_ID).should('be.visible')
          cy.getByTestId('button-dialog-main-action').click()
        })

        it('AboutDialog not visible, onboarding overlay closes, model visible - Screen', () => {
          cy.getByTestId(DIALOG_ID).should('not.exist')
          cy.getByTestId('onboarding-overlay').should('be.visible').click()
          cy.getByTestId('onboarding-overlay').should('not.exist')
          cy.percySnapshot()
        })
      })
    })
  })
})


const idPart = ABOUT_MISSION.toLowerCase().replaceAll(' ', '-').replaceAll('.', '')
const DIALOG_ID = `dialog-${idPart}`
