import React from 'react'
import {render, screen, waitFor} from '@testing-library/react'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'
import ShareMock from '../ShareMock'
import SideDrawerWrapper from './SideDrawer'


test('side drawer notes', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.turnCommentsOn()
    result.current.openDrawer()
  })
  render(<ShareMock><SideDrawerWrapper/></ShareMock>)
  await waitFor(() => {
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })
  // reset the store
  act(() => {
    result.current.turnCommentsOff()
  })
})


test('side drawer properties', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  act(() => {
    result.current.toggleIsPropertiesOn()
    result.current.openDrawer()
  })
  render(<ShareMock><SideDrawerWrapper/></ShareMock>)
  await waitFor(() => {
    expect(screen.getByText('Properties')).toBeInTheDocument()
  })
  // reset the store
  act(() => {
    result.current.setSelectedElement({})
    result.current.toggleIsPropertiesOn()
  })
})


test('side drawer - issues id in url', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  const extractedCommentId = '1257156364'
  act(() => {
    result.current.setSelectedIssueId(Number(extractedCommentId))
    result.current.turnCommentsOn()
    result.current.openDrawer()
  })
  render(<ShareMock><SideDrawerWrapper/></ShareMock>)
  await waitFor(() => {
    expect(screen.getByText('Note')).toBeInTheDocument()
    expect(screen.getByText('BLDRS-LOCAL_MODE-ID:1257156364')).toBeInTheDocument()
  })
  // reset the store
  act(() => {
    result.current.setSelectedElement({})
    result.current.turnCommentsOff()
  })
})


test('side drawer - opened via URL', async () => {
  const {result} = renderHook(() => useStore((state) => state))
  const {getByText} = render(
      <ShareMock
        initialEntries={['/v/p/index.ifc#i:1257156364::c:-26.91,28.84,112.47,-22,16.21,-3.48']}
      >
        <SideDrawerWrapper/>
      </ShareMock>)

  await waitFor(() => {
    expect(getByText('Note')).toBeInTheDocument()
    expect(getByText('BLDRS-LOCAL_MODE-ID:1257156364')).toBeInTheDocument()
  })

  // reset the store
  act(() => {
    result.current.setSelectedElement({})
    result.current.turnCommentsOff()
  })
})

