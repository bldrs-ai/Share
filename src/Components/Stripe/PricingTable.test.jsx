import React from 'react'
import {render} from '@testing-library/react'
import PricingTable from './PricingTable'


describe('Stripe/PricingTable', () => {
  /** @return {Element} the rendered pricing-table custom element */
  function table() {
    return document.querySelector('stripe-pricing-table')
  }

  // The attribute Stripe copies to the Checkout Session's
  // client_reference_id, where the stripe-webhook reads the GA client id.
  it('sets client-reference-id from the GA client reference', () => {
    render(<PricingTable theme='dark' userEmail='a@b.c' clientReferenceId='gacid_111_222'/>)
    expect(table().getAttribute('client-reference-id')).toBe('gacid_111_222')
    expect(table().getAttribute('customer-email')).toBe('a@b.c')
  })

  it('leaves client-reference-id off without one, rather than sending a blank', () => {
    render(<PricingTable/>)
    expect(table()).not.toBeNull()
    expect(table().hasAttribute('client-reference-id')).toBe(false)
  })
})
