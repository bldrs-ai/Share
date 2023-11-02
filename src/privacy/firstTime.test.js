import * as FirstTime from './firstTime'


describe('FirstTime', () => {
  test('isfirst true by default', () => {
    expect(FirstTime.isFirst()).toBe(true)
  })


  test('setSeen', () => {
    expect(FirstTime.isFirst()).toBe(true)
    FirstTime.setVisited()
    expect(FirstTime.isFirst()).toBe(false)
  })
})
