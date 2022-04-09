import * as Privacy from './Privacy'


test('getCookie', () => {
  Privacy.setCookie({component: 'component', name: 'name', value: 'true'})
  const retValue = Privacy.getCookie({
    component: 'component',
    name: 'name',
    defaultValue: 'defaultValue'})
  expect(retValue).toBe('true')
})


test('getCookieBoolean', () => {
  Privacy.setCookie({component: 'component', name: 'name', value: 'true'})
  const retValue = Privacy.getCookieBoolean({
    component: 'component',
    name: 'name',
    defaultValue: 'value'})
  expect(retValue).toBe(true)
})


test('isPrivacySocialEnabled', () => {
  Privacy.setCookie({component: 'privacy', name: 'social', value: 'true'})
  const retValue = Privacy.isPrivacySocialEnabled()
  expect(retValue).toBe(true)
})


test('isPrivacyUsageEnabled', () => {
  Privacy.setCookie({component: 'privacy', name: 'usage', value: 'true'})
  const retValue = Privacy.isPrivacySocialEnabled()
  expect(retValue).toBe(true)
})
