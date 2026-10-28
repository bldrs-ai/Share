/*
 * GA4 names of the funnel's "Subscribed" step, shared by the app
 * (privacy/analytics#FUNNEL_EVENTS) and the stripe-webhook function
 * (netlify/functions/_lib/subscriptionAnalytics.js), which imports this file
 * the way `_lib/subscriptions.js` imports src/quota/proStatus.js. It has no
 * imports of its own, so the function bundle gets nothing else from src/.
 *
 * Since 2026-10 the server is the source of truth for the two funnel
 * names: the webhook sends them through the Measurement Protocol on the
 * Auth0 tier write, which happens whether or not the user ever opens the app
 * again. The browser's own sighting of the same transition (BaseRoutes →
 * subscriptionTracking.js, on the pendingReauth token) goes out under the
 * `_client` names instead, so the two never add up in one count — see
 * design/new/quotas.md §"Server-side subscription events".
 *
 * The bizdev dashboard queries `subscription_started` / `subscription_ended`
 * verbatim, and GA4 has no rename: change both ends together, or neither.
 */
export const SUBSCRIPTION_EVENT_NAMES = Object.freeze({
  STARTED: 'subscription_started',
  ENDED: 'subscription_ended',
  STARTED_CLIENT: 'subscription_started_client',
  ENDED_CLIENT: 'subscription_ended_client',
})
