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


describe('dereferenceAndProxyDownloadContents', () => {
  beforeEach(() => {
    getPathContents.mockReset()
  })


  it('passes a non-github host through verbatim', async () => {
    expect(
      await dereferenceAndProxyDownloadContents('https://example.com/model.ifc', '', false),
    ).toStrictEqual(['https://example.com/model.ifc', '', false, false])
    expect(getPathContents).not.toHaveBeenCalled()
  })


  it('uses getPathContents for github.com URLs when an access token is provided', async () => {
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


  it('uses getPathContents for github.com URLs even without an access token (proxy retired)', async () => {
    getPathContents.mockResolvedValueOnce({
      content: 'https://media.githubusercontent.com/media/bldrs-ai/test-models/main/big.ifc',
      sha: 'cafef00d',
      isCacheHit: false,
      isBase64: false,
    })

    const result = await dereferenceAndProxyDownloadContents(
      'https://github.com/bldrs-ai/test-models/blob/main/big.ifc',
      '',
      true,
    )

    expect(result).toStrictEqual([
      'https://media.githubusercontent.com/media/bldrs-ai/test-models/main/big.ifc',
      'cafef00d',
      false,
      false,
    ])
    expect(getPathContents).toHaveBeenCalledTimes(1)
  })


  it('returns inline base64 content when the Contents API returns it for a small file', async () => {
    getPathContents.mockResolvedValueOnce({
      content: 'aGVsbG8=',
      sha: 'abc123',
      isCacheHit: false,
      isBase64: true,
    })

    const result = await dereferenceAndProxyDownloadContents(
      'https://github.com/bldrs-ai/Share/blob/main/README.md',
      '',
      true,
    )

    expect(result).toStrictEqual(['aGVsbG8=', 'abc123', false, true])
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
