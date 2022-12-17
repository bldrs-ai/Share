import {preprocessMediaQuery} from './mediaQuery'


test('preprocessMediaQuery', () => {
  const mobileWidthPx = 100
  expect(preprocessMediaQuery(mobileWidthPx, {
    '@media (max-width: MOBILE_WIDTH)': {
      'display': 'none',
      '@media (max-width: MOBILE_WIDTH)': {
        foo: 'bar',
      },
    },
  })).toStrictEqual({
    '@media (max-width: 100px)': {
      'display': 'none',
      '@media (max-width: 100px)': {
        foo: 'bar',
      },
    },
  })
})
