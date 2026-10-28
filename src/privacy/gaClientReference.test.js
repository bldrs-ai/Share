import {decodeGaClientReference, encodeGaClientReference} from './gaClientReference'


describe('privacy/gaClientReference', () => {
  // Stripe silently drops a client_reference_id with anything but
  // alphanumerics, dashes and underscores; a GA client id has a dot.
  const STRIPE_ACCEPTS = /^[A-Za-z0-9_-]{1,200}$/

  it('round-trips a GA4 client id through a value Stripe accepts', () => {
    const reference = encodeGaClientReference('1871520000.1754700000')
    expect(reference).toBe('gacid_1871520000_1754700000')
    expect(reference).toMatch(STRIPE_ACCEPTS)
    expect(decodeGaClientReference(reference)).toBe('1871520000.1754700000')
  })

  it('encodes nothing that is not a GA4 client id', () => {
    for (const notAnId of [null, undefined, '', '1871520000', 'GA1.1.1871520000.1754700000', 'a.b', '1.2.3', Number('1.2')]) {
      expect(encodeGaClientReference(notAnId)).toBeNull()
    }
  })

  it('decodes the component beside another, joined by a dash', () => {
    expect(decodeGaClientReference('gacid_1_2-auth0_x')).toBe('1.2')
    expect(decodeGaClientReference('auth0_x-gacid_1_2')).toBe('1.2')
  })

  it('decodes nothing from a reference without a whole component', () => {
    for (const ref of [null, '', 'cus_123', 'gacid_1', 'gacid_1_2x', 'xgacid_1_2', 'gacid_1_2_3', 'gacid_a_b']) {
      expect(decodeGaClientReference(ref)).toBeNull()
    }
  })
})
