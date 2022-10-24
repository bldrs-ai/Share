import React from 'react'
import {act, render, screen, renderHook} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import {Loader} from './Loader'


describe('Loader', () => {
  it('loader in the test', async () => {
    const id = 123
    const index = 123
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setIssues([])
    })
    render(
        <ShareMock>
          <Loader
            id={id}
            date='2000-01-01T00:00:00Z'
            username='bob'
            index={index}
            title="new_title"
          />
        </ShareMock>)
    expect(screen.getByText('new_title')).toBeInTheDocument()
    expect(screen.getByText('2000-01-01 00:00:00Z')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })
})
