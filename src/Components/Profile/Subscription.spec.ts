import {expect, test, Page} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Opens the profile pop-over after a mocked login.
 */
async function openProfileMenu(page: Page) {
  await auth0Login(page) // logs in (shows "Log out")
  await page.getByTestId('control-button-profile').click()
}

/**
 * Sets the subscription tier in the store
 *
 * @param page - Playwright page object
 * @param tier - The subscription tier to set
 */
async function setSubscriptionTier(page: Page, tier: 'sharePro' | 'free' = 'free') {
  await page.evaluate((subscriptionTier) => {
    if (!(window as any).store) {
      throw new Error(
        'Zustand store not found on window – make sure win.store is set in test builds.',
      )
    }

    const meta = {
      userEmail: 'cypress@bldrs.ai',
      stripeCustomerId: subscriptionTier === 'sharePro' ? 'cus_test_123' : null,
      subscriptionStatus: subscriptionTier === 'sharePro' ? 'sharePro' : 'free',
    }

    ;(window as any).store.getState().setAppMetadata(meta)
  }, tier)
}

/**
 * Migrated from cypress/e2e/profile-100/subscription.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1282
 */
describe('Profile 100: subscription menu items', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
  })

  describe('Authenticated Pro customer', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)

      // Mock Stripe Portal response
      await page.route('https://stripe.portal.msw/mockportal/session/*', async (route) => {
        await route.fulfill({
          status: 200,
          body: '<html><body><h1>Mock Stripe Portal</h1></body></html>',
          headers: {'content-type': 'text/html'},
        })
      })
    })

    test('shows "Manage Subscription" and hides "Upgrade to Pro"', async ({page}) => {
      await setSubscriptionTier(page, 'sharePro') // inject Pro metadata
      await openProfileMenu(page)

      await expect(page.getByText('Manage Subscription')).toBeVisible()
      await expect(page.getByText('Upgrade to Pro')).toHaveCount(0)

      // click "Manage Subscription" and assert redirect
      await page.getByText('Manage Subscription').click()

      // Wait for navigation to Stripe portal
      await page.waitForURL(/https:\/\/stripe\.portal\.msw\/mockportal\/session\//)

      await expectScreen(page, 'Profile-Pro-user.png')
    })
  })

  describe('Authenticated Free customer', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('shows "Upgrade to Pro" and hides "Manage Subscription"', async ({page}) => {
      await setSubscriptionTier(page, 'free') // inject Free metadata
      await openProfileMenu(page)

      await expect(page.getByText('Upgrade to Pro')).toBeVisible()
      await expect(page.getByText('Manage Subscription')).toHaveCount(0)

      // click "Upgrade to Pro" and assert redirect
      await page.getByText('Upgrade to Pro').click()

      await expect(page.getByText('Mock Subscribe Page')).toBeVisible()

      await expectScreen(page, 'Profile-Free-user.png')
    })
  })
})
