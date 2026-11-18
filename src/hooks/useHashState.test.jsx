import React from 'react'
import {act, renderHook} from '@testing-library/react'
import {BrowserRouter, useNavigate} from 'react-router-dom'
import useHashState from './useHashState'


/**
 * @param {object} wrapper
 * @return {object}
 */
function Wrapper({children, wrapper}) {
  return (
    <BrowserRouter>
      {wrapper ? wrapper({children}) : children}
    </BrowserRouter>
  )
}


describe('useHashState', () => {
  beforeEach(() => {
    // Reset window.location.hash before each test
    window.location.hash = ''
  })

  it('should add hash params when state becomes active', () => {
    const {rerender} = renderHook(
      ({isActive}) => useHashState('test', isActive),
      {
        initialProps: {isActive: false},
        wrapper: Wrapper,
      },
    )

    // Initially no hash
    expect(window.location.hash).toBe('')

    // When state becomes active, should add hash
    rerender({isActive: true})
    expect(window.location.hash).toContain('test:')
  })

  it('should remove hash params when state becomes inactive', () => {
    // Start with hash present
    window.location.hash = 'test:value'

    const {rerender} = renderHook(
      ({isActive}) => useHashState('test', isActive),
      {
        initialProps: {isActive: true},
        wrapper: Wrapper,
      },
    )

    // When state becomes inactive, should remove hash
    rerender({isActive: false})
    expect(window.location.hash).not.toContain('test:')
  })

  it('should not modify hash when state matches hash state', () => {
    window.location.hash = '#test:value'

    renderHook(
      () => useHashState('test', true),
      {
        wrapper: Wrapper,
      },
    )

    // Hash should remain unchanged when state matches
    expect(window.location.hash).toBe('#test:value')
  })

  // open-205 #2021: a rewrite that only follows a navigation must not be a
  // history entry of its own, or Forward loses every entry ahead.
  describe('after a navigation that changed only the location', () => {
    const renderWithNavigate = (isActive) => renderHook(
      ({active}) => {
        useHashState('test', active)
        return useNavigate()
      },
      {initialProps: {active: isActive}, wrapper: Wrapper},
    )

    it('drops a token the state doesn\'t hold in place, with no new entry', () => {
      const {result} = renderWithNavigate(false)
      const lengthBefore = window.history.length
      act(() => result.current('/other#test:'))
      // The navigation is the entry; the hook's rewrite is not another.
      expect(window.location.hash).toBe('')
      expect(window.history.length).toBe(lengthBefore + 1)
      expect(window.location.pathname).toBe('/other')
    })

    it('puts back a token the state holds in place, with no new entry', () => {
      const {result} = renderWithNavigate(true)
      expect(window.location.hash).toContain('test:')
      const lengthBefore = window.history.length
      act(() => result.current('/elsewhere'))
      expect(window.location.hash).toContain('test:')
      expect(window.history.length).toBe(lengthBefore + 1)
    })

    it('still makes a state change its own entry', () => {
      const {rerender} = renderHook(({active}) => useHashState('test', active),
        {initialProps: {active: false}, wrapper: Wrapper})
      const lengthBefore = window.history.length
      rerender({active: true})
      expect(window.history.length).toBe(lengthBefore + 1)
    })
  })
})
