import {isValidModelURL, constructModelPath} from './ShareRoutes'


// valid url format
test('isValidModelURL', () => {
  // eslint-disable-next-line
  const retValue = isValidModelURL('https://www.github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(true)
})


// valid url format: no wwww
test('isValidModelURL', () => {
  // eslint-disable-next-line
  const retValue = isValidModelURL('https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(true)
})


// invalid url format: no https://
test('isValidModelURL', () => {
  const retValue = isValidModelURL('github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(false)
})


// ivalid url format: mistake in domain name
test('isValidModelURL', () => {
  const retValue = isValidModelURL('githubcom/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(false)
})


// test constructModel URL
test('constructModelURL', () => {
  // eslint-disable-next-line
  const retValue = constructModelPath('https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe('/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
})

