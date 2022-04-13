import React from 'react'
import {render} from '@testing-library/react'
import {mockRoutes} from './BaseRoutesMock.test'
import ShareRoutes,{isValidModelURL,constructModelPath} from './ShareRoutes'


// test('ShareRoutes', () => {
//   const {getByText} = render(mockRoutes(
//       <ShareRoutes
//         installPrefix={'/'}
//         appPrefix={'share'} /> ))
//   expect(getByText(/BLDRS/i)).toBeInTheDocument()
// })


//valid url format
test('isValidModelURL', () => {
  const retValue = isValidModelURL('https://www.github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(true)
})


//valid url format: no wwww
test('isValidModelURL', () => {
  const retValue = isValidModelURL('https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(true)
})


//invalid url format: no https://
test('isValidModelURL', () => {
  const retValue = isValidModelURL('github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(false)
})


//ivalid url format: mistake in domain name
test('isValidModelURL', () => {
  const retValue = isValidModelURL('githubcom/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(false)
})


//test constructModel URL
test('constructModelURL', () => {
  const retValue = constructModelPath('https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe('/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
})

