
const Sentry = require('@sentry/serverless');

Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});

/**
  User clicks Profile > "Manage subscription" in Share, and this redirects
  to a page on Stripe that lets them configure their sub.
*/
exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    const body = JSON.parse(event.body);
    const { stripeCustomerId } = body;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: 'https://bldrs.ai/',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: portalSession.url }),
    };
  } catch (error) {
    Sentry.captureException(error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
});