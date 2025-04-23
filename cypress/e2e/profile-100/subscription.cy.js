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
    beforeEach(() => {
      returningUserVisitsHomepageWaitForModel()

      cy.intercept(
        {
          method: 'GET',
          url: 'https://stripe.portal.msw/mockportal/session/*',
        },
        {
          statusCode: 200,
          body: '<html><body><h1>Mock Stripe Portal</h1></body></html>',
          headers: {'content-type': 'text/html'},
        },
      ).as('stripePortal')
    })

    it('shows “Manage Subscription” and hides “Upgrade to Pro”', () => {
      cy.setSubscriptionTier('sharePro') // 👈 inject Pro metadata
      openProfileMenu()

      cy.contains('Manage Subscription').should('be.visible')
      cy.contains('Upgrade to Pro').should('not.exist')

      // click “Manage Subscription” and assert redirect
      cy.contains('Manage Subscription')
        .click()

      cy.wait('@stripePortal')

      cy.location('href').should('include', /https:\/\/stripe\.portal\.msw\/mockportal\/session\//)

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

      // click “Upgrade to Pro” and assert redirect
      cy.contains('Upgrade to Pro')
        .click()

      cy.contains('Mock Subscribe Page').should('be.visible')

      cy.percySnapshot('Profile – Free user')
    })
  })
})
