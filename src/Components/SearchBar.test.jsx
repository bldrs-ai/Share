import React from 'react'
import {render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import SearchBar, {
  containsIfcPath,
  stripIfcPathFromLocation,
  validSearchQuery,
} from './SearchBar'


describe( 'SearchBar', () => {
  it('containsIfcPath', () => {
    const testPairs = {
      '/share/v/p/index.ifc': false,
      '/share/v/p/index.ifc/1': true,
      '/share/v/p/index.ifc/1/2': true,
      '/share/v/p/index.ifc/1/2/3': true,
      '/share/v/p/index.ifc?q=': false,
      '/share/v/p/index.ifc?q=asdf': false,
      '/share/v/p/index.ifc?q=/1': false,
      '/share/v/p/index.ifc?q=1/2': false,
      '/share/v/p/index.ifc/1?q=': true,
      '/share/v/p/index.ifc/1/2?q=': true,
      '/share/v/p/index.ifc/1/2/3?q=': true,
    }
    for (const path in testPairs) {
      if (Object.prototype.hasOwnProperty.call(testPairs, path)) {
        expect(containsIfcPath({pathname: path})).toEqual(testPairs[path])
      }
    }
  })

  it('validSearchQuery', () => {
    const testPairs = {
      '?q=': false,
      '?q=asdf': true,
      '?q=/1': true,
      '?q=1/2': true,
    }
    for (const paramStr in testPairs) {
      if (Object.prototype.hasOwnProperty.call(testPairs, paramStr)) {
        const isValid = testPairs[paramStr]
        expect(validSearchQuery(new URLSearchParams(paramStr))).toEqual(isValid)
      }
    }
  })

  it('stripIfcPathFromLocation', () => {
    expect(stripIfcPathFromLocation({
      pathname: '/share/v/p/index.ifc',
    })).toBe('/share/v/p/index.ifc')
    expect(stripIfcPathFromLocation({
      pathname: '/share/v/p/index.ifc?q=foo',
    })).toBe('/share/v/p/index.ifc?q=foo')
    expect(stripIfcPathFromLocation({
      pathname: '/share/v/p/index.ifc/84/103',
    })).toBe('/share/v/p/index.ifc')
    expect(stripIfcPathFromLocation({
      pathname: '/share/v/p/index.ifc/84/103?q=foo',
    })).toBe('/share/v/p/index.ifc?q=foo')
  })

  it('SeachBar', () => {
    // eslint-disable-next-line no-empty-function
    render(<ShareMock><SearchBar onClickMenuCb={() => {}} isOpen={true}/></ShareMock>)
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument()
  })
})
