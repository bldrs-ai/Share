const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

/**
 * Fetch an Auth0 Management API token via Client Credentials flow.
 * We'll use this short-lived token to call the Management API.
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
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return response.data.access_token; // Short-lived token for Auth0 Management API
  } catch (err) {
    console.error('Error fetching Management API token:', err.message);
    throw err;
  }
}

exports.handler = async (event, context) => {
  // 1. Verify the Stripe webhook signature
  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeEvent; 

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  // 2. Handle the subscription update event
  if (stripeEvent.type === 'customer.subscription.created') {
    const subscription = stripeEvent.data.object;
    const stripeCustomerId = subscription.customer; // Stripe customer ID

    try {
      // 2a. Retrieve the Stripe customer to get their email
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      const customerEmail = customer.email;

      if (!customerEmail) {
        console.error('No email found on Stripe customer.');
      } else {
        console.log(`Stripe customer email: ${customerEmail}`);

        // 2b. Fetch an Auth0 Management API token
        const mgmtToken = await getManagementApiToken();

        // 2c. Query Auth0 for the user by email
        const auth0UserResp = await axios.get(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(
            customerEmail
          )}`,
          {
            headers: {
              Authorization: `Bearer ${mgmtToken}`,
            },
          }
        );

        const users = auth0UserResp.data;
        if (!users || users.length === 0) {
          console.error(`No Auth0 user found for email: ${customerEmail}`);
        } else {
          // Assume the first returned user is correct
          const auth0UserId = users[0].user_id;
          console.log(`Found Auth0 user ID: ${auth0UserId}`);

          // 2d. Determine if the subscription is a pro plan
          let isPro = false;
          if (
            subscription.items &&
            Array.isArray(subscription.items.data) &&
            subscription.items.data.length > 0
          ) {
            isPro = subscription.items.data.some(
              (item) => item.price && item.price.id === process.env.SHARE_PRO_PRICE_ID
            );
          }

          // 2e. Decide on the new subscription status
          // By default, use the Stripe subscription.status
          // or set to something custom if they upgraded
          let newStatus = subscription.status;
          if (isPro) {
            newStatus = 'shareProPendingReauth';
          }

          // 2f. Update the user's app_metadata in Auth0
          try {
            const updateResp = await axios.patch(
              `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(
                auth0UserId
              )}`,
              {
                app_metadata: { subscriptionStatus: newStatus },
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${mgmtToken}`,
                },
              }
            );
            console.log('Updated Auth0 user with subscription status:', updateResp.data);

            // 2g. If the user upgraded, optionally revoke refresh tokens
            if (isPro) {
              try {
                const revokeResp = await axios.post(
                  `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(
                    auth0UserId
                  )}/revoke-refresh-tokens`,
                  {},
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${mgmtToken}`,
                    },
                  }
                );
                console.log('Revoked refresh tokens for user', auth0UserId, revokeResp.data);
              } catch (revokeError) {
                console.error('Error revoking refresh tokens:', revokeError.message);
              }
            }
          } catch (updateError) {
            console.error('Error updating Auth0 user metadata:', updateError.message);
          }
        }
      }
    } catch (err) {
      console.error('Error retrieving Stripe customer or updating Auth0:', err);
    }
  }

  // Return success so Stripe doesn't retry indefinitely
  return {
    statusCode: 200,
    body: 'Success',
  };
};
