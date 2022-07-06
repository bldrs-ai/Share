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
  // reset the store
  act(() => {
    result.current.toggleIsCommentsOn()
  })
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


test('side drawer - issues id in url', () => {
  const {result} = renderHook(() => useStore((state) => state))
  const extractedCommentId = '1257156364'
  act(() => {
    result.current.setSelectedIssueId(Number(extractedCommentId))
    result.current.toggleIsCommentsOn()
    result.current.openDrawer()
  })
  render(<MockRoutes contentElt={<SideDrawerWrapper/>}/>)
  expect(screen.getByText('Note')).toBeInTheDocument()
  expect(screen.getByText('BLDRS: OPEN WORKSPACE - LOCAL MODE')).toBeInTheDocument()
})

