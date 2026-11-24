import {isShareOrigin} from './shareOrigin.js'


describe('_lib/shareOrigin', () => {
  it.each([
    'https://bldrs.ai',
    'https://www.bldrs.ai',
    'https://deploy-preview-2114--bldrs-share-prod.netlify.app',
    'https://deploy-preview-2114--bldrs-share.netlify.app',
    'http://localhost:8080',
    'http://localhost:8888',
  ])('accepts %s', (origin) => {
    expect(isShareOrigin(origin)).toBe(true)
  })

  it.each([
    'https://bldrs.ai.evil.example',
    'https://evil.example',
    'http://bldrs.ai',
    'https://deploy-preview-1--someone-else.netlify.app',
    'null',
    '',
    null,
    undefined,
  ])('refuses %s', (origin) => {
    expect(isShareOrigin(origin)).toBe(false)
  })
})
