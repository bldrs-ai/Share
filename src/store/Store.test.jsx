import React from 'react'
import {render, renderHook} from '@testing-library/react'
import useStore from './useStore'
import {StoreCtx} from './Store.fixture'


describe('Store', () => {
  it('StoreCtx sets test repo', () => {
    renderHook(() => useStore((state) => state))
    render(<StoreCtx/>)
  })
})
