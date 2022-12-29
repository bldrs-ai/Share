import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import ExtractLevelsMenu from './ExtractLevelsMenu'
import ShareMock from '../ShareMock'


describe('ExtractLevel', () => {
  it('ExtractLevel Button', () => {
    const {getByTitle} = render(<ShareMock><ExtractLevelsMenu/></ShareMock>)
    expect(getByTitle('Isolate Levels')).toBeInTheDocument()
  })

  it('ExtractLevel Menu', () => {
    const {getByTitle} = render(<ShareMock><ExtractLevelsMenu/></ShareMock>)
    const exLevButton = getByTitle('Isolate Levels')
    fireEvent.click(exLevButton)
    expect(getByTitle('Toggle Plan View')).toBeInTheDocument()
  })
})
