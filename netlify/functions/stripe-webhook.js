// netlify/functions/stripe-webhook.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

exports.handler = async (event, context) => {
  // Retrieve the Stripe signature from headers (note that Netlify lowercases header names)
  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeEvent;

  try {
    // Construct the event using the raw body provided by Stripe
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`,
    };
  }

  // Handle the subscription update event
  if (stripeEvent.type === 'customer.subscription.updated') {
    const subscription = stripeEvent.data.object;
    const stripeCustomerId = subscription.customer; // This is the Stripe customer id

    try {
      // Retrieve the full customer object from Stripe
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      
      // Retrieve the Auth0 user ID stored in the customer's metadata
      const auth0UserId = customer.metadata.auth0UserId;
      if (!auth0UserId) {
        console.error('No Auth0 user ID found in customer metadata.');
      } else {
        console.log(`Found Auth0 user ID: ${auth0UserId}`);
        
        // Update the user's app_metadata in Auth0 with the new subscription status.
        // The PATCH request will update (or add) the "subscriptionStatus" key in app_metadata.
        try {
          const response = await axios.patch(
            `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${auth0UserId}`,
            {
              app_metadata: { subscriptionStatus: subscription.status }
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.AUTH0_MANAGEMENT_TOKEN}`
              }
            }
          );
          console.log('Updated Auth0 user with subscription status:', response.data);
        } catch (updateError) {
          console.error('Error updating Auth0 user metadata:', updateError.message);
        }
      }
    } catch (err) {
      console.error('Error retrieving Stripe customer:', err);
    }
  }

  // You can handle additional event types similarly if needed.

  return {
    statusCode: 200,
    body: 'Success',
  };
};
