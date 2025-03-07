import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'


/**
 * PricingTable returns the stripe pricing table
 *
 * @return {ReactElement}
 */
function PricingTable({theme = 'light'}) {
  const appMetadata = useStore((state) => state.appMetadata)
  const userEmail = appMetadata?.userEmail || ''
  // const stripeCustomerId = appMetadata?.stripeCustomerId || ''

  // return (<potio-pricing-table action="payment"data-key="BFrRi9f1cuR1Bdpv"
  // customer-email={userEmail} customer={stripeCustomerId}></potio-pricing-table>)

  return (<stripe-pricing-table
    pricing-table-id={ theme === 'light' ? 'prctbl_1QoVS9LeGkCV6AgY5pcBHXNm' : 'prctbl_1QoZdELeGkCV6AgYT86y4X6O'}
    publishable-key="pk_test_51QoTe6LeGkCV6AgYfZMrD5CyoFJysYFa2dwoAflwHnY2U1Vj69iGn6eoOtW3HcQtUMK5MHF90UYn0xPJGgAxwW73001sFhhjxS"
    data-theme={theme}
    customer-email={userEmail}
          />)
}

export default PricingTable
