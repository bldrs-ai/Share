import React from 'react'
import {renderHook} from '@testing-library/react'
import {BrowserRouter} from 'react-router-dom'
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
})
