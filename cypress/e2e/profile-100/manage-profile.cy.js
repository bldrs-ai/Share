// cypress/e2e/manage-profile.cy.ts
// ────────────────────────────────────────────────────────────────
import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'

/* ─────────── shared helpers ─────────── */
const openManageProfile = (connection = 'github') => {
  auth0Login(connection) // mocked login
  cy.get('[data-testid="control-button-profile"]').click()
  cy.get('[data-testid="manage-profile"]').click()
  cy.contains('Account Settings') // modal open
}

/* ─────────────────────────────────────── */

describe('ManageProfile modal', () => {
  beforeEach(homepageSetup)

  context('When only GitHub is linked', () => {
    beforeEach(() => {
      // user with GitHub identity only
      returningUserVisitsHomepageWaitForModel()
    })

    it('shows “Authorize” for Google', () => {
      openManageProfile()

      cy.get('[data-testid="authorize-google-oauth2"]')
        .contains('Authorize')
        .should('be.visible')

      cy.percySnapshot('ManageProfile – GitHub linked only')
    })
})

context('When only Google is linked', () => {
   beforeEach(() => {
      // user with GitHub identity only
      returningUserVisitsHomepageWaitForModel()
    })

    it('shows “Authorize” for Github', () => {
      openManageProfile('google-oauth2')

      cy.get('[data-testid="authorize-github"]')
        .contains('Authorize')
        .should('be.visible')

      cy.percySnapshot('ManageProfile – GitHub linked only')
    })
})

  context('Links accounts after Authorize is clicked', () => {
    beforeEach(() => {
      returningUserVisitsHomepageWaitForModel()
    })

    it('refreshes tokens and marks Google as Connected', () => {
      // open and click Authorize
      openManageProfile()
      cy.get('[data-testid="authorize-google-oauth2"]').click()

      // UI now shows Connected
      cy.contains('Google')
        .parent()
        .contains('Connected')
        .should('be.visible')

      cy.percySnapshot('ManageProfile – Both providers linked')
    })
  })

  context('Modal Close button', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('hides the dialog when Close clicked', () => {
      openManageProfile()
      cy.contains('button', 'Close').click()
      cy.contains('Account Settings').should('not.exist')
    })
  })
})
