import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import {MockRoutes, MOCK_SELECTED_ELEMENT, MockElement} from '../BaseRoutesMock.test'
import SideDrawerWrapper from './SideDrawer'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'
import {MemoryRouter} from 'react-router-dom'


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
  // reset the store
  act(() => {
    result.current.setSelectedElement({})
    result.current.toggleIsPropertiesOn()
  })
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
  expect(screen.getByText('BLDRS-LOCAL_MODE-ID:1257156364')).toBeInTheDocument()
  // reset the store
  act(() => {
    result.current.setSelectedElement({})
    result.current.toggleIsCommentsOn()
  })
})


test('side drawer - opened via URL', async () => {
  const {result} = renderHook(() => useStore((state) => state))

  const {getByText} = render(
      <MemoryRouter initialEntries={['/v/p/index.ifc#i:1257156364::c:-26.91,28.84,112.47,-22,16.21,-3.48']}>
        <MockElement>
          <SideDrawerWrapper />
        </MockElement>
      </MemoryRouter>,
  )

  await waitFor(() => {
    expect(getByText('Note')).toBeInTheDocument()
    expect(getByText('BLDRS-LOCAL_MODE-ID:1257156364')).toBeInTheDocument()
  })

  // reset the store
  act(() => {
    result.current.setSelectedElement({})
    result.current.toggleIsCommentsOn()
  })
})
