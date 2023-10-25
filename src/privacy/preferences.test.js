import * as Preferences from './preferences'


describe('Preferences', () => {
  test('getTheme is undefined by default', () => {
    expect(Preferences.getTheme()).toBe(undefined)
  })


  test('setTheme', () => {
    expect(Preferences.getTheme()).toBe(undefined)
    Preferences.setTheme('foo')
    expect(Preferences.getTheme()).toBe('foo')
  })
})
