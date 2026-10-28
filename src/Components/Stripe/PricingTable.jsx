import React, {ReactElement} from 'react'


/**
 * PricingTable returns the stripe pricing table
 *
 * `clientReferenceId` becomes the Checkout Session's `client_reference_id`
 * (the pricing table's only per-session hook; it can't set metadata). The
 * stripe-webhook reads this browser's GA client id back from it
 * (privacy/gaClientReference.js). Omitted when null: React leaves an
 * undefined attribute off a custom element, where an empty one would reach
 * Stripe as a blank reference.
 *
 * @param {object} props
 * @param {string} [props.theme]
 * @param {string} [props.userEmail]
 * @param {?string} [props.clientReferenceId] from subscribe/subscribeParams
 * @return {ReactElement}
 */
export default function PricingTable({theme = 'light', userEmail = '', clientReferenceId = null}) {
  // const stripeCustomerId = appMetadata?.stripeCustomerId || ''

  // return (<potio-pricing-table action="payment"data-key="BFrRi9f1cuR1Bdpv"
  // customer-email={userEmail} customer={stripeCustomerId}></potio-pricing-table>)

  return (
    <stripe-pricing-table
      pricing-table-id={ theme === 'light' ? 'prctbl_1RGSYGLeGkCV6AgYIBMdCREq' : 'prctbl_1RGSaDLeGkCV6AgY4jJULsFq'}
      publishable-key="pk_live_51QoTe6LeGkCV6AgYMyOqTlFV7M5x4fhUftM4cXi4AhWfMPrksesUEdEj0Z4z14xeL5Mzc2Ja6ruCSwYkWLUEA3jR000dcD2xdw"
      data-theme={theme}
      customer-email={userEmail}
      client-reference-id={clientReferenceId || undefined}
    />
  )
}
