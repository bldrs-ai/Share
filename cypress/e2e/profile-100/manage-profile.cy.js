// cypress/e2e/manage-profile.cy.ts
// ────────────────────────────────────────────────────────────────
import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'


/**
 * Open the Manage Profile dialog
 *
 * @param {string} connection - The connection to login with
 */
function openManageProfile(connection = 'github') {
  auth0Login(connection) // mocked login
  cy.get('[data-testid="control-button-profile"]').click()
  cy.get('[data-testid="manage-profile"]').click()
  cy.get('[data-testid="dialog-manage-profile"]').should('be.visible')
}

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

      // UI now shows unlink button
      cy.get('[data-testid="unlink-google-oauth2"]').should('be.visible')

      cy.percySnapshot('ManageProfile – Both providers linked')
    })
  })

  context('Modal Close button', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('hides the dialog when Close clicked', () => {
      openManageProfile()
      cy.get('[data-testid="button-close-dialog-manage-profile"]').click()
      cy.get('[data-testid="dialog-manage-profile"]').should('not.exist')
    })
  })
})
