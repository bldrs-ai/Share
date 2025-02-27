import React, {ReactElement} from 'react'
import {renderHook, act} from '@testing-library/react'
import {MemoryRouter, useNavigate} from 'react-router-dom'
import ReactGA from 'react-ga4'
import usePageTracking, {GA_ID} from './usePageTracking'


jest.mock('react-ga4', () => ({
  initialize: jest.fn(),
  send: jest.fn(),
}))


describe('usePageTracking', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  /**
   * A simple wrapper that lets us control initial routes with MemoryRouter
   *
   * @return {ReactElement}
   */
  function wrapper({children, initialEntries = ['/first']}) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    )
  }

  test('initializes GA once on mount', () => {
    renderHook(() => usePageTracking(), {
      wrapper,
    })
    expect(ReactGA.initialize).toHaveBeenCalledTimes(1)
    expect(ReactGA.initialize).toHaveBeenCalledWith(GA_ID)
  })

  test('sends a pageview for the initial route', () => {
    renderHook(() => usePageTracking(), {wrapper})
    expect(ReactGA.send).toHaveBeenCalledTimes(1)
    expect(ReactGA.send).toHaveBeenCalledWith({
      hitType: 'pageview',
      page: '/first',
    })
  })

  test('sends a pageview on route change using navigate()', () => {
    // We'll create a small custom hook inside the test that:
    // 1) uses our usePageTracking hook
    // 2) exposes the navigate function so we can call it in our test
    const useTestHook = () => {
      const navigate = useNavigate()
      usePageTracking()
      return {navigate}
    }

    const {result} = renderHook(() => useTestHook(), {
      wrapper,
    })

    // Initially, we have one pageview for '/first'
    expect(ReactGA.send).toHaveBeenCalledTimes(1)
    expect(ReactGA.send).toHaveBeenLastCalledWith({
      hitType: 'pageview',
      page: '/first',
    })

    // Now let's navigate to '/second'
    act(() => {
      result.current.navigate('/second')
    })

    // We should now have 2 calls total
    expect(ReactGA.send).toHaveBeenCalledTimes(2)
    expect(ReactGA.send).toHaveBeenLastCalledWith({
      hitType: 'pageview',
      page: '/second',
    })
  })
})
