/* eslint-disable no-magic-numbers */
import {
  findUrls,
  floatStrTrim,
  isNumber,
  isNumeric,
  matchUuid,
} from './strings'


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
    expect(findUrls(`- [cam 1](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48)
- [cam 2](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48)
- [cam 3](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48)
`)).toStrictEqual([
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48',
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48',
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48',
    ])
  })


  it('isNumeric recognizes common cases', () => {
    expect(isNumeric('-1')).toBeTruthy()
    expect(isNumeric('0')).toBeTruthy()
    expect(isNumeric('1')).toBeTruthy()
    expect(isNumeric('NaN')).toBeFalsy()
  })


  it('isNumber recognizes common cases', () => {
    expect(isNumber(-1)).toBeTruthy()
    expect(isNumber('-1')).toBeTruthy()
    expect(isNumber(0)).toBeTruthy()
    expect(isNumber('0')).toBeTruthy()
    expect(isNumber(1)).toBeTruthy()
    expect(isNumber('1')).toBeTruthy()
    expect(isNumber('-1vw')).toBeFalsy()
    expect(isNumber('1vw')).toBeFalsy()
    expect(isNumber('NaN')).toBeFalsy()
  })


  it('floatStrTrim convert string to finite string', () => {
    expect(floatStrTrim('0')).toStrictEqual(0)
    expect(floatStrTrim('12.34567')).toStrictEqual(12.346)
    expect(floatStrTrim('12.340')).toStrictEqual(12.34)
    expect(floatStrTrim('12.300')).toStrictEqual(12.3)
    expect(floatStrTrim('12.000')).toStrictEqual(12)
    expect(floatStrTrim('-4.500826166251047')).toStrictEqual(-4.501)
  })


  it('matchUuid', () => {
    expect(matchUuid('marry had a little lamb')).toBe(false)
    expect(matchUuid('ADD77535D1B649A9915B41343B08BF83')).toBe(false)
    expect(matchUuid('ADD77535-D1B6-49A9-915B-41343B08BF83')).toBe(true)
  })


  it('findMarkdownUrls matches test camera string', () => {
    expect(findUrls(`- [cam 1](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48)
- [cam 2](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48)
- [cam 3](http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48)
`)).toStrictEqual([
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48',
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-10,16.21,-3.48',
      'http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,0,16.21,-3.48',
    ])
  })
})
