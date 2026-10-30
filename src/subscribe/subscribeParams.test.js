import {subscribePageParams} from './subscribeParams'


describe('subscribe/subscribeParams', () => {
  it('passes the GA client reference on as the client-reference-id', () => {
    expect(subscribePageParams('?theme=dark&userEmail=a%2Bb%40c.d&gaRef=gacid_111_222')).toEqual({
      theme: 'dark',
      userEmail: 'a+b@c.d',
      clientReferenceId: 'gacid_111_222',
    })
  })

  it('drops a reference that does not decode, rather than handing Stripe arbitrary text', () => {
    expect(subscribePageParams('?gaRef=hello%20world').clientReferenceId).toBeNull()
    expect(subscribePageParams('?gaRef=gacid_1').clientReferenceId).toBeNull()
  })

  it('defaults to light, with no email and no reference', () => {
    expect(subscribePageParams('')).toEqual({theme: 'light', userEmail: null, clientReferenceId: null})
  })
})
