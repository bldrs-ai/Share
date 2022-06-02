import gtag from './gtag'


test('gtag', () => {
  let args = null
  window.dataLayer = {
    push: (a) => {
      args = a
    },
  }
  gtag('a', 'b')
  expect(args).toMatchObject({0: 'a', 1: 'b'})
})
