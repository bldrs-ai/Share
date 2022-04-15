import {isURL, isValidModelURL, parseIfcURL} from './ShareRoutes'


test('isURL: valid url format', () => {
  const retValue = isURL('www.google.com')
  expect(retValue).toBe(true)
})


test('isURL: valid url format', () => {
  const retValue = isURL('https://google.com')
  expect(retValue).toBe(true)
})


test('isUrl: invalid url format', () => {
  const retValue = isURL('google')
  expect(retValue).toBe(false)
})


test('isValidModelURL: valid url format', () => {
  const retValue = isValidModelURL('https://www.github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(true)
})


test('isValidModelURL: valid url format: no wwww', () => {
  const retValue = isValidModelURL('https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  expect(retValue).toBe(true)
})


test('isValidModelURL: invalid url format: no https://', () => {
  try {
    const retValue = isValidModelURL('github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
    expect(retValue).toBe(false)
  } catch (e) {
    expect(e.message).toBe('github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  }
})


test('isValidModelURL: ivalid url format: mistake in domain name', () => {
  try {
    const retValue = isValidModelURL('githubcom/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
    expect(retValue).toBe(false)
  } catch (e) {
    expect(e.message).toBe('githubcom/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  }
})


test('isValidModelURL: invalid url format: mistake in domain name', () => {
  try {
    const retValue = isValidModelURL('www.google.com')
    expect(retValue).toBe(false)
  } catch (e) {
    expect(e.message).toBe('Invalid URL: www.google.com')
  }
})


test('parseIfcURL: correct link', () => {
  try {
    const retValue = parseIfcURL('https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
    expect(retValue).toBe('/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
  } catch (e) {
    console.log('error', e.message)
    expect(e.message).toBe('Invalid URL: https://github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  }
})


test('parseIfcURL: invalid URL', () => {
  try {
    const retValue = parseIfcURL('github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
    expect(retValue).toBe('/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
  } catch (e) {
    expect(e.message).toBe('Invalid URL: github.com/Swiss-Property-AG/Portfolio/blob/main/EISVOGEL.ifc')
  }
})


test('parseIfcURL: test raw path', () => {
  try {
    const retValue = parseIfcURL('https://raw.githubusercontent.com/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
    expect(retValue).toBe('/share/v/gh/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
  } catch (e) {
    expect(e.message).toBe('Invalid URL: https://raw.githubusercontent.com/Swiss-Property-AG/Portfolio/main/EISVOGEL.ifc')
  }
})

