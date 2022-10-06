import React from 'react'
import {fireEvent, render} from '@testing-library/react'
import ExtractLevelsMenu from './ExtractLevelsMenu'
import ShareMock from '../ShareMock'


describe('ExtractLevel', () => {
  it('ExtractLeve Button', () => {
    const {getByTitle} = render(<ShareMock><ExtractLevelsMenu/></ShareMock>)
    expect(getByTitle('Extract Levels')).toBeInTheDocument()
  })

  it('ExtractLevel Menu', () => {
    const {getByTitle} = render(<ShareMock><ExtractLevelsMenu/></ShareMock>)
    const exLevButton = getByTitle('Extract Levels')
    fireEvent.click(exLevButton)
    expect(getByTitle('Toggle Plan View')).toBeInTheDocument()
  })
})

