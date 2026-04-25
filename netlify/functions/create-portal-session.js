
const Sentry = require('@sentry/serverless')


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

/**
  User clicks Profile > "Manage subscription" in Share, and this redirects
  to a page on Stripe that lets them configure their sub.
 */
exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return {statusCode: 405, body: JSON.stringify({error: 'Method Not Allowed'})}
  }

  const user = event.clientContext && event.clientContext.user
  if (!user) {
    return {statusCode: 401, body: JSON.stringify({error: 'Unauthorized'})}
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

  try {
    const body = event.body ? JSON.parse(event.body) : {}
    const requestedStripeCustomerId = body && body.stripeCustomerId
    const stripeCustomerId =
      (user.app_metadata && user.app_metadata.stripeCustomerId) ||
      (user.user_metadata && user.user_metadata.stripeCustomerId)

    if (!stripeCustomerId) {
      return {statusCode: 403, body: JSON.stringify({error: 'Forbidden'})}
    }

    if (requestedStripeCustomerId && requestedStripeCustomerId !== stripeCustomerId) {
      return {statusCode: 403, body: JSON.stringify({error: 'Forbidden'})}
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: 'https://bldrs.ai/',
    })

    console.log('Created billing portal session', {
      userId: user.sub,
      stripeCustomerId,
      portalSessionId: portalSession.id,
    })

    return {
      statusCode: 200,
      body: JSON.stringify({url: portalSession.url}),
    }
  } catch (error) {
    Sentry.captureException(error)
    return {statusCode: 500, body: JSON.stringify({error: error.message})}
  }
})
