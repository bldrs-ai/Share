import {existInFeature} from './common'


delete global.window.location
global.window = Object.create(window)
global.window.location = {
  ancestorOrigins: null,
  hash: null,
  host: null,
  port: null,
  protocol: 'https:',
  hostname: null,
  href: 'https://bldrs.ai?feature=placemark,auth',
  origin: 'https://bldrs.ai',
  pathname: null,
  search: '?feature=placemark,auth',
  assign: null,
  reload: null,
  replace: null,
}


describe('common', () => {
  it('existInFeature matches test names', () => {
    expect(existInFeature('placemark')).toBeTruthy()
    expect(existInFeature('auth')).toBeTruthy()
    expect(!existInFeature('other')).toBeTruthy()
  })
})
