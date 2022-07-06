import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes, MOCK_SELECTED_ELEMENT} from '../BaseRoutesMock.test'
import SideDrawerWrapper from './SideDrawer'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'


test('side drawer notes', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.toggleIsCommentsOn()
    result.current.openDrawer()
  })
  render(<MockRoutes contentElt={<SideDrawerWrapper/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})


test('side drawer properties', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.setSelectedElement(MOCK_SELECTED_ELEMENT)
    result.current.toggleIsPropertiesOn()
    result.current.openDrawer()
  })
  render(<MockRoutes contentElt={<SideDrawerWrapper/>}/>)
  expect(screen.getByText('Properties')).toBeInTheDocument()
})


