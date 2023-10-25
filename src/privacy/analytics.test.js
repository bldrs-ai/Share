import * as Analytics from './Analytics'


describe('Analytics', () => {
  test('isAllowed true by default', () => {
    expect(Analytics.isAllowed()).toBe(true)
  })


  test('setIsAllowed', () => {
    expect(Analytics.isAllowed()).toBe(true)
    Analytics.setIsAllowed(false)
    expect(Analytics.isAllowed()).toBe(false)
    Analytics.setIsAllowed(true)
    expect(Analytics.isAllowed()).toBe(true)
  })
})
