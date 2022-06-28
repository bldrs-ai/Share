import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import {NotesPanel, PropertiesPanel} from './SideDrawerPanels'


test('Notes panel', () => {
  render(<MockRoutes contentElt={<NotesPanel/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})

test('Properties panel', () => {
  render(<MockRoutes contentElt={<PropertiesPanel/>}/>)
  expect(screen.getByText('Properties')).toBeInTheDocument()
})
