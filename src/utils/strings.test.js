import {findUrls} from './strings'


describe('strings', () => {
  it('findUrls matches test url', () => {
    [
      'http://example.com',
      'http://example.com/',
      'https://example.com',
      'https://example.com/',
      'https://example.com:8080',
      'https://example.com:8080/',
      'https://example.com:8080/#',
      'https://example.com:8080/?',
      'https://example.com:8080/asdf/af/f/a/#sadf?fdfd',
    ].forEach((url) => {
      expect(findUrls(`${url}`)).toStrictEqual([url])
      expect(findUrls(`asdf ${url}`)).toStrictEqual([url])
      expect(findUrls(`${url} dddd`)).toStrictEqual([url])
      expect(findUrls(`asdf ${url} ddd`)).toStrictEqual([url])
      expect(findUrls(`asdf${url} ddd`)).toStrictEqual([url])
      expect(findUrls(`[link text](${url})`)).toStrictEqual([url])
    })
  })

  it('findUrls matches test camera string', () => {
    expect(
        findUrls(`- [cam 1](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48)
- [cam 2](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48)
- [cam 3](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48)
`),
    ).toStrictEqual([
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48',
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48',
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48',
    ])
  })
})
