import {getFinalUrl} from './urls'
import testEnvVars from '../../tools/jest/testEnvVars'


describe.only('With environment variables', () => {
  const OLD_ENV = process.env


  beforeEach(() => {
    jest.resetModules()
    process.env = {...OLD_ENV}
  })


  afterAll(() => {
    process.env = OLD_ENV
  })


  it.only('getFinalUrl', async () => {
    expect(await getFinalUrl('https://github.com/')).toStrictEqual(`${testEnvVars.RAW_GIT_PROXY_URL_NEW}/`)

    process.env.RAW_GIT_PROXY_URL = 'https://rawgit.bldrs.dev.jest/model'
    expect(await getFinalUrl('https://github.com/')).toStrictEqual('https://rawgit.bldrs.dev.jest/model/')
  })
})
