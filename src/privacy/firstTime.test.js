import Cookies from 'js-cookie'
import * as FirstTime from './firstTime'


describe('FirstTime', () => {
  beforeEach(() => {
    Cookies.remove(FirstTime.COOKIE_NAME)
  })

  test.skip('isfirst true by default', () => {
    expect(FirstTime.isFirst()).toBe(true)
  })


  test.skip('setSeen', () => {
    expect(FirstTime.isFirst()).toBe(true)
    FirstTime.setVisited()
    expect(FirstTime.isFirst()).toBe(false)
  })
})
