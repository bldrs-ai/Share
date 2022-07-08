import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockRoutes, MOCK_SELECTED_ELEMENT} from '../BaseRoutesMock.test'
import SideDrawerWrapper from './SideDrawer'
import {act, renderHook} from '@testing-library/react-hooks'
import useStore from '../store/useStore'
// import {addHashParams, getHashParams, ISSUE_PREFIX} from '../utils/location'


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


// test('side drawer - issues id in url', () => {
//   const {result} = renderHook(() => useStore((state) => state))

//   // rying to set the url -- but don't think it is working
//   addHashParams(window.location, ISSUE_PREFIX, {id: '1257156364'})
//   // I am not sure if getHashParams is working
//   const issueHash = getHashParams(window.location, 'i')

//   // the previous test is testing the rest of the process
//   const extractedCommentId = issueHash.split(':')[1]
//   act(() => {
//     result.current.setSelectedIssueId(Number(extractedCommentId))
//     result.current.toggleIsCommentsOn()
//     result.current.openDrawer()
//   })
//   render(<MockRoutes contentElt={<SideDrawerWrapper/>}/>)
//   expect(screen.getByText('Note')).toBeInTheDocument()
//   expect(screen.getByText('BLDRS-LOCAL_MODE-ID:1257156364')).toBeInTheDocument()
// })


