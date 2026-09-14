import {captureException} from '@sentry/react'


/**
 * Where a user goes to start or manage their subscription.
 *
 * Extracted from `ProfileControl#onSubscriptionClick` (unchanged behaviour)
 * when the Export section gained a second "you need Pro for this" call site
 * (design/new/glb-export-premium.md §4.4). One implementation matters
 * because the branch is not obvious: a user we already know as a Stripe
 * customer must land in the PORTAL (where their existing subscription
 * lives), and only a user we don't goes to the checkout page — sending a
 * subscriber to `/subscribe/` would offer them a second subscription.
 *
 * The portal URL is minted server-side from the bearer token, never from a
 * client-supplied customer id (#1489).
 *
 * @param {object} args
 * @param {?string} args.stripeCustomerId From `app_metadata`; null for a
 *   user who has never subscribed
 * @param {string} args.userEmail Prefills the checkout page
 * @param {boolean} args.isDay Current theme, passed through to checkout
 * @param {Function} args.getAccessTokenSilently Auth0
 * @param {boolean} [args.useMock] Cypress/Playwright builds, where the
 *   `/subscribe/` page is an MSW stub that has to be written into the
 *   document rather than navigated to
 * @return {Promise<void>}
 */
export async function goToSubscription({
  stripeCustomerId,
  userEmail,
  isDay,
  getAccessTokenSilently,
  useMock = false,
}) {
  if (stripeCustomerId) {
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: 'https://api.github.com/',
          scope: 'openid profile email offline_access',
        },
      })
      const response = await fetch('/.netlify/functions/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        console.error('No portal URL returned:', data)
        // report in sentry
        captureException(new Error('No portal URL returned:', data))
      }
    } catch (err) {
      console.error('Error creating portal session:', err)
      // report in sentry
      captureException(err)
    }
    return
  }

  const themeParam = isDay ? 'light' : 'dark'
  const subscribeUrl = `/subscribe/?theme=${themeParam}&userEmail=${userEmail}`
  if (useMock) {
    try {
      const res = await fetch(subscribeUrl)
      const html = await res.text()
      document.open()
      document.write(html)
      document.close()
    } catch (err) {
      console.error('Error loading mock subscribe page:', err)
      // report in sentry
      captureException(err)
    }
    return
  }
  window.location.href = subscribeUrl
}
