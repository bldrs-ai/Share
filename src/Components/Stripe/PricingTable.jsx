import React, {ReactElement} from 'react'


/**
 * PricingTable returns the stripe pricing table
 *
 * @return {ReactElement}
 */
export default function PricingTable({theme = 'light', userEmail = ''}) {
  // const stripeCustomerId = appMetadata?.stripeCustomerId || ''

  // return (<potio-pricing-table action="payment"data-key="BFrRi9f1cuR1Bdpv"
  // customer-email={userEmail} customer={stripeCustomerId}></potio-pricing-table>)

  return (
    <stripe-pricing-table
      pricing-table-id={ theme === 'light' ? 'prctbl_1RGSYGLeGkCV6AgYIBMdCREq' : 'prctbl_1RGSaDLeGkCV6AgY4jJULsFq'}
      publishable-key="pk_live_51QoTe6LeGkCV6AgYMyOqTlFV7M5x4fhUftM4cXi4AhWfMPrksesUEdEj0Z4z14xeL5Mzc2Ja6ruCSwYkWLUEA3jR000dcD2xdw"
      data-theme={theme}
      customer-email={userEmail}
    />
  )
}
