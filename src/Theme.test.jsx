import {Themes, getSystemCurrentLightDark} from './Theme'


// https://stackoverflow.com/questions/41885841/how-can-i-mock-the-javascript-window-object-using-jest
let windowSpy

beforeEach(() => {
  windowSpy = jest.spyOn(window, 'window', 'get')
})


afterEach(() => {
  windowSpy.mockRestore()
})


describe('Theme', () => {
  test('getSystemCurrentLightDark is day when system is day', () => {
    windowSpy.mockImplementation(() => ({
      matchMedia: jest.fn((query) => {
        return {matches: query !== '(prefers-color-scheme: dark)'}
      }),
    }))
    expect(getSystemCurrentLightDark()).toBe(Themes.Day)
  })

  test('getSystemCurrentLightDark is night when system is night', () => {
    windowSpy.mockImplementation(() => ({
      matchMedia: jest.fn((query) => {
        return {matches: query === '(prefers-color-scheme: dark)'}
      }),
    }))
    expect(getSystemCurrentLightDark()).toBe(Themes.Night)
  })
})
