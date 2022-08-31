import React from 'react'
import {act, render, renderHook, screen, waitFor} from '@testing-library/react'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import SideDrawerWrapper from './SideDrawer'


test('side drawer notes', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.turnCommentsOn()
    result.current.openDrawer()
  })
  render(<ShareMock><SideDrawerWrapper/></ShareMock>)
  await waitFor(() => {
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })
  // reset the store
  await act(() => {
    result.current.turnCommentsOff()
  })
})


test('side drawer properties', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  await act(() => {
    result.current.toggleIsPropertiesOn()
    result.current.openDrawer()
  })
  render(<ShareMock><SideDrawerWrapper/></ShareMock>)
  await waitFor(() => {
    expect(screen.getByText('Properties')).toBeInTheDocument()
  })
  // reset the store
  await act(() => {
    result.current.setSelectedElement({})
    result.current.toggleIsPropertiesOn()
  })
})


test('side drawer - issues id in url', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  const extractedIssueId = '1257156364'
  await act(() => {
    result.current.setSelectedIssueId(Number(extractedIssueId))
    result.current.turnCommentsOn()
    result.current.openDrawer()
  })
  render(<ShareMock><SideDrawerWrapper/></ShareMock>)
  await waitFor(() => {
    expect(screen.getByText('BLDRS-LOCAL_MODE-ID:1257156364')).toBeInTheDocument()
  })
  // reset the store
  await act(() => {
    result.current.setSelectedElement({})
    result.current.turnCommentsOff()
  })
})


test('side drawer - opened via URL', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  const {getByText} = render(
      <ShareMock
        initialEntries={['/v/p/index.ifc#i:2::c:-26.91,28.84,112.47,-22,16.21,-3.48']}
      >
        <SideDrawerWrapper/>
      </ShareMock>)

  await waitFor(() => {
    expect(getByText('LOCAL ISSUE 2')).toBeInTheDocument()
  })

  // reset the store
  await act(() => {
    result.current.setSelectedElement({})
    result.current.turnCommentsOff()
  })
})


test('Shared issue with comments via URL - test for issue body', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  const {getByText, debug} = render(
      <ShareMock
        initialEntries={['/v/p/index.ifc#i:2']}
      >
        <SideDrawerWrapper/>
      </ShareMock>)
  debug()
  await waitFor(() => {
    expect(getByText('Test Issue body')).toBeInTheDocument()
  })

  // reset the store
  await act(() => {
    result.current.setSelectedElement({})
    result.current.turnCommentsOff()
  })
})
