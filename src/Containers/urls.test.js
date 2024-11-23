import {getFinalUrl} from './urls'


describe('With environment variables', () => {
  const OLD_ENV = process.env


  beforeEach(() => {
    jest.resetModules()
    process.env = {...OLD_ENV}
  })


  afterAll(() => {
    process.env = OLD_ENV
  })


  it('getFinalUrl', async () => {
    expect(await getFinalUrl('https://github.com/')).toStrictEqual(`${process.env.RAW_GIT_PROXY_URL}/`)

    process.env.RAW_GIT_PROXY_URL = 'https://rawgit.bldrs.dev'
    expect(await getFinalUrl('https://github.com/')).toStrictEqual('https://rawgit.bldrs.dev/')
  })
})
