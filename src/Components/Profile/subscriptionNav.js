import {captureException} from '@sentry/react'
import {FUNNEL_EVENTS, gtagFunnelEvent} from '../../privacy/analytics'


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
 * @param {string} [args.from] Which upgrade entry point was clicked
 *   ('profile' | 'export' | 'quota'), reported as the `from` param of the
 *   funnel's begin_checkout event. Every caller must name itself; 'unknown'
 *   showing up in GA means one doesn't.
 * @return {Promise<void>}
 */
export async function goToSubscription({
  stripeCustomerId,
  userEmail,
  isDay,
  getAccessTokenSilently,
  useMock = false,
  from = 'unknown',
}) {
  // The funnel's "Upgrade click" step (analytics#FUNNEL_EVENTS). Emitted
  // here, the one door every upgrade CTA goes through, so each path counts
  // exactly once and a new CTA can't be added uncounted. Both branches
  // count: a known Stripe customer reaching the portal may be a lapsed
  // subscriber resubscribing — but may also be a current one managing
  // billing, so `destination` lets a report keep the two apart.
  //
  // `transport_type: 'beacon'` because both branches end in a full-page
  // navigation (the checkout one immediately below), which would otherwise
  // cancel a still-queued collect request — same reasoning as
  // analytics#startModelEngagement's flush on pagehide.
  gtagFunnelEvent(FUNNEL_EVENTS.BEGIN_CHECKOUT, {
    from,
    destination: stripeCustomerId ? 'portal' : 'checkout',
    transport_type: 'beacon',
  })
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
  // Encoded: a `+` in an address would otherwise decode as a space on the
  // subscribe page (URLSearchParams), prefilling the wrong email.
  const subscribeUrl = `/subscribe/?theme=${themeParam}&userEmail=${encodeURIComponent(userEmail || '')}`
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
