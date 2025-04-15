import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  auth0Login,
} from '../../support/utils'


describe('Profile 100: subscription menu items', () => {
  beforeEach(homepageSetup)

  /** Opens the profile pop‑over after a mocked login. */
  const openProfileMenu = () => {
    auth0Login() // logs in (shows “Log out”)
    cy.get('[data-testid="control-button-profile"]').click()
  }

  context('Authenticated Pro customer', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('shows “Manage Subscription” and hides “Upgrade to Pro”', () => {
      cy.setSubscriptionTier('sharePro') // 👈 inject Pro metadata
      openProfileMenu()

      cy.contains('Manage Subscription').should('be.visible')
      cy.contains('Upgrade to Pro').should('not.exist')

      cy.percySnapshot('Profile – Pro user')
    })
  })

  context('Authenticated Free customer', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('shows “Upgrade to Pro” and hides “Manage Subscription”', () => {
      cy.setSubscriptionTier('free') // 👈 inject Free metadata
      openProfileMenu()

      cy.contains('Upgrade to Pro').should('be.visible')
      cy.contains('Manage Subscription').should('not.exist')

      cy.percySnapshot('Profile – Free user')
    })
  })
})
