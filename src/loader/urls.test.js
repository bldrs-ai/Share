/* eslint-disable no-magic-numbers */
import {getPathContents} from '../net/github/Files'
import {
  SOURCE_TYPE,
  dereferenceAndProxyDownloadContents,
  parseCoords,
  parseUrl,
} from './urls'


// Mock the GitHub contents fetch so the authenticated proxy branch of
// `dereferenceAndProxyDownloadContents` can be exercised without a real
// network round-trip.
jest.mock('../net/github/Files', () => ({
  getPathContents: jest.fn(),
}))


// TODO(https://github.com/oven-sh/bun/issues/6492): switch back to toStrictEquals when fixed.

describe('parseUrl', () => {
  it('parses bldrs index.ifc', () => {
    const url = new URL('https://bldrs.ai/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
    const converted = new URL('https://raw.githubusercontent.com/bldrs-ai/Share/main/public/index.ifc')
    const parsed = parseUrl(url)
    expect(parsed).toEqual({
      original: url,
      type: SOURCE_TYPE.VCS,
      target: {
        organization: 'bldrs-ai',
        repository: 'Share',
        ref: 'main',
        url: converted,
      },
      params: {c: '-133.022,131.828,161.85,-38.078,22.64,-2.314'},
    })
  })


  it('parses bldrs index.ifc', () => {
    const url =
          new URL('https://bldrs.ai/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86')
    const converted = new URL('https://raw.githubusercontent.com/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc')
    const parsed = parseUrl(url)
    expect(parsed).toEqual({
      original: url,
      type: SOURCE_TYPE.VCS,
      target: {
        organization: 'Swiss-Property-AG',
        repository: 'Momentum-Public',
        ref: 'main',
        url: converted,
      },
      params: {c: '-38.64,12.52,35.4,-5.29,0.94,0.86'},
    })
  })


  it('parses bldrs index.ifc', () => {
    // eslint-disable-next-line max-len
    const url = new URL('https://github.com/buildingSMART/IFC/blob/master/Examples/Building%20element%20standard%20case/Examples/Wall%20standard%20case/File.ifc')
    // eslint-disable-next-line max-len
    const converted = new URL('https://raw.githubusercontent.com/buildingSMART/IFC/master/Examples/Building%20element%20standard%20case/Examples/Wall%20standard%20case/File.ifc')
    const parsed = parseUrl(url)
    const expected = {
      original: url,
      type: SOURCE_TYPE.VCS,
      target: {
        organization: 'buildingSMART',
        repository: 'IFC',
        ref: 'master',
        url: converted,
      },
      params: {
        '': undefined,
      },
    }
    expect(parsed).toEqual(expected)
  })


  it('parses localhost file ref', () => {
    const url = new URL('https://localhost:8090/models/bld/mix.bld')
    const parsed = parseUrl(url)
    expect(parsed).toEqual({
      original: url,
      type: SOURCE_TYPE.URL,
      target: {
        url: url,
      },
      params: {
        '': undefined,
      },
    })
  })
})


describe('With environment variables', () => {
  const OLD_ENV = process.env


  beforeEach(() => {
    jest.resetModules()
    process.env = {...OLD_ENV}
  })


  afterAll(() => {
    process.env = OLD_ENV
  })


  it('constructDownloadUrl', async () => {
    const testProxy = 'https://a.b.com/'

    // Used when isOpfsAvailable = false
    process.env.RAW_GIT_PROXY_URL = `${testProxy}/foo`
    // Used when isOpfsAvailable = true
    process.env.RAW_GIT_PROXY_URL_NEW = `${testProxy}/bar`

    let isOpfsAvailable = false
    expect(await dereferenceAndProxyDownloadContents(
      'https://github.com/', '', isOpfsAvailable)).toStrictEqual([`${testProxy}/foo/`, '', false, false])

    isOpfsAvailable = true
    expect(await dereferenceAndProxyDownloadContents(
      'https://github.com/', '', isOpfsAvailable)).toStrictEqual([`${testProxy}/bar/`, '', false, false])
  })


  it('copies the proxy URL port onto the rewritten URL when present', async () => {
    process.env.RAW_GIT_PROXY_URL_NEW = 'https://proxy.example:8443/prefix'

    const [url] = await dereferenceAndProxyDownloadContents(
      'https://github.com/bldrs-ai/Share/blob/main/README.md',
      '',
      true,
    )

    const parsed = new URL(url)
    expect(parsed.host).toBe('proxy.example:8443')
    expect(parsed.port).toBe('8443')
    expect(parsed.pathname).toBe('/prefix/bldrs-ai/Share/blob/main/README.md')
  })


  it('passes a non-github host through verbatim', async () => {
    expect(
      await dereferenceAndProxyDownloadContents('https://example.com/model.ifc', '', false),
    ).toStrictEqual(['https://example.com/model.ifc', '', false, false])
  })


  it('uses getPathContents when an access token is provided (authenticated path)', async () => {
    getPathContents.mockResolvedValueOnce({
      content: 'https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md',
      sha: 'deadbeef',
      isCacheHit: true,
      isBase64: false,
    })

    const result = await dereferenceAndProxyDownloadContents(
      'https://github.com/bldrs-ai/Share/blob/main/README.md',
      'gho_token',
      true,
    )

    expect(result).toStrictEqual([
      'https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md',
      'deadbeef',
      true,
      false,
    ])
    expect(getPathContents).toHaveBeenCalledTimes(1)
  })
})


describe('parseUrl error path', () => {
  it('throws when called with undefined', () => {
    expect(() => parseUrl(undefined)).toThrow('No URL provided')
  })

  it('throws when called with null', () => {
    expect(() => parseUrl(null)).toThrow('No URL provided')
  })
})


describe('parseCoords', () => {
  it('returns the six-zero default when the url has no hash', () => {
    expect(parseCoords(new URL('https://example.com/'))).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('parses a comma-separated camera hash into six floats', () => {
    const url = new URL('https://example.com/#c:-1.5,2.25,3,0,0,0')
    expect(parseCoords(url)).toEqual([-1.5, 2.25, 3, 0, 0, 0])
  })

  // TODO: parseCoords returns the zero-default when the hash exists but
  // has no `c:` param. That's slightly different from the other parsers
  // in this file, which return `undefined` fields. Captured for the
  // refactor so behavior stays explicit.
  it('returns the six-zero default when the hash exists but has no c: param', () => {
    const url = new URL('https://example.com/#foo:bar')
    expect(parseCoords(url)).toEqual([0, 0, 0, 0, 0, 0])
  })
})
