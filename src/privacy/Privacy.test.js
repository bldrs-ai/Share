import * as Privacy from './Privacy'


test('getCookie', () => {
  Privacy.setCookie({component: 'component', name: 'name', value: 'value'})
  const retValue = Privacy.getCookie({
    component: 'component',
    name: 'name',
    defaultValue: 'defaultValue'})
  expect(retValue).toBe('value')
})
