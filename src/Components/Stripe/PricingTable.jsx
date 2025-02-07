import React, {ReactElement} from 'react'


/**
 * PricingTable returns the stripe pricing table
 *
 * @return {ReactElement}
 */
function PricingTable({theme = 'light'}) {
  /* return <div id="pricing-table"></div>*/

  return (<stripe-pricing-table
    pricing-table-id={ theme === 'light' ? 'prctbl_1QoVS9LeGkCV6AgY5pcBHXNm' : 'prctbl_1QoZdELeGkCV6AgYT86y4X6O'}
    publishable-key="pk_test_51QoTe6LeGkCV6AgYfZMrD5CyoFJysYFa2dwoAflwHnY2U1Vj69iGn6eoOtW3HcQtUMK5MHF90UYn0xPJGgAxwW73001sFhhjxS"
    data-theme={theme}
          />)
}

export default PricingTable
