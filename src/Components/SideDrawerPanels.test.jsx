import React from 'react'
import {render, screen} from '@testing-library/react'
import ShareMock from '../ShareMock'
import {NotesPanel, PropertiesPanel} from './SideDrawerPanels'


test('Notes panel', () => {
  render(<ShareMock><NotesPanel/></ShareMock>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})


test('Properties panel', () => {
  render(<ShareMock><PropertiesPanel/></ShareMock>)
  expect(screen.getByText('Properties')).toBeInTheDocument()
})
