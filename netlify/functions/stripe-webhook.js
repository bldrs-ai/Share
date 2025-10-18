const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const axios = require('axios')

const Sentry = require('@sentry/serverless')


Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})

/**
 * Fetch an Auth0 Management API token via Client Credentials flow.
 * We'll use this short-lived token to call the Management API.
 *
 * @return {Promise<string>} The access token
 */
async function getManagementApiToken() {
  try {
    const response = await axios.post(
      `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
      {
        client_id: process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials',
      },
      {
        headers: {'Content-Type': 'application/json'},
      },
    )
    return response.data.access_token // Short-lived token for Auth0 Management API
  } catch (err) {
    Sentry.captureException(err)
    throw err
  }
}

exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  // 1. Verify the Stripe webhook signature
  const sig = event.headers['stripe-signature']
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
  let stripeEvent

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret)
  } catch (err) {
    Sentry.captureException(err)
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    }
  }

  // 2. Handle the subscription created event
  if (stripeEvent.type === 'customer.subscription.created') {
    const subscription = stripeEvent.data.object
    const stripeCustomerId = subscription.customer // Stripe customer ID

    try {
      // 2a. Retrieve the Stripe customer to get their email
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      const customerEmail = customer.email

      if (!customerEmail) {
        const err = new Error(`No email found on Stripe customer ${stripeCustomerId}`)
        Sentry.captureException(err)
      } else {
        // 2b. Fetch an Auth0 Management API token
        const mgmtToken = await getManagementApiToken()

        // 2c. Query Auth0 for the user by email
        const auth0UserResp = await axios.get(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(
            customerEmail,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${mgmtToken}`,
            },
          },
        )

        const users = auth0UserResp.data
        if (!users || users.length === 0) {
          const err = new Error(`No Auth0 user found for email: ${customerEmail}`)
          Sentry.captureException(err)
        } else {
          // Assume the first returned user is correct
          const auth0UserId = users[0].user_id

          // 2d. Determine if the subscription is a pro plan
          let isPro = false
          if (
            subscription.items &&
            Array.isArray(subscription.items.data) &&
            subscription.items.data.length > 0
          ) {
            isPro = subscription.items.data.some(
              (item) => item.price && item.price.id === process.env.SHARE_PRO_PRICE_ID,
            )
          }

          // 2e. Decide on the new subscription status
          // By default, use the Stripe subscription.status
          // or set to something custom if they upgraded
          let newStatus = subscription.status
          if (isPro) {
            newStatus = 'shareProPendingReauth'
          }

          // 2f. Update the user's app_metadata in Auth0
          try {
            await axios.patch(
              `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(
                auth0UserId,
              )}`,
              {
                app_metadata: {subscriptionStatus: newStatus, stripeCustomerId: stripeCustomerId},
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${mgmtToken}`,
                },
              },
            )
          } catch (updateError) {
            Sentry.captureException(updateError)
          }
        }
      }
    } catch (err) {
      Sentry.captureException(err)
    }
  } else if (stripeEvent.type === 'customer.subscription.deleted') {
    // 3. Handle the subscription cancellation event
    const subscription = stripeEvent.data.object
    const stripeCustomerId = subscription.customer

    try {
      // Retrieve the Stripe customer to get their email
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      const customerEmail = customer.email

      if (!customerEmail) {
        const err = new Error('No email found on Stripe customer during cancellation.')
        Sentry.captureException(err)
      } else {
        // Fetch an Auth0 Management API token
        const mgmtToken = await getManagementApiToken()

        // Query Auth0 for the user by email
        const auth0UserResp = await axios.get(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(
            customerEmail,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${mgmtToken}`,
            },
          },
        )

        const users = auth0UserResp.data
        if (!users || users.length === 0) {
          const err = new Error(`No Auth0 user found for email: ${customerEmail}`)
          Sentry.captureException(err)
        } else {
          // Assume the first returned user is correct
          const auth0UserId = users[0].user_id

          // Update the user's app_metadata to reflect the cancellation
          // Here, we set the status to 'freePendingReauth'
          await axios.patch(
            `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
            {
              app_metadata: {subscriptionStatus: 'freePendingReauth', stripeCustomerId: stripeCustomerId},
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mgmtToken}`,
              },
            },
          )
        }
      }
    } catch (err) {
      Sentry.captureException(err)
    }
  } else {
    const err = new Error(`Unhandled event type: ${JSON.stringify(stripeEvent)}`)
    Sentry.captureException(err)
  }

  // Return success so Stripe doesn't retry indefinitely
  return {
    statusCode: 200,
    body: 'Success',
  }
})
