import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes} from '../BaseRoutesMock.test'
import SideDrawer from './SideDrawer'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'


test('side drawer notes', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.toggleIsCommentsOn()
  })
  render(<MockRoutes contentElt={<SideDrawer/>}/>)
  expect(screen.getByText('Notes')).toBeInTheDocument()
})


test('side drawer properties', () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.toggleIsPropertiesOn()
  })
  render(<MockRoutes contentElt={<SideDrawer/>}/>)
  expect(screen.getByText('Properties')).toBeInTheDocument()
})


