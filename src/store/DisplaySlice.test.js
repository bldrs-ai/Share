import {act, renderHook} from '@testing-library/react'
import useStore from './useStore'


describe('DisplaySlice', () => {
  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.resetDisplayOverrides()
    })
  })

  it('starts empty', () => {
    const {result} = renderHook(() => useStore((state) => state))
    expect(result.current.displayOverrides).toEqual({})
    expect(result.current.getDisplayOverrideList()).toEqual([])
  })

  it('keys one entry per scope and merges appearance axes', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setDisplayOverride({kind: 'model'}, {color: 'source'})
    })
    await act(() => {
      result.current.setDisplayOverride({kind: 'model'}, {shading: 'wireframe'})
    })
    expect(result.current.displayOverrides.model).toEqual({
      scope: {kind: 'model'},
      appearance: {color: 'source', shading: 'wireframe'},
    })
  })

  it('drops an axis set back to undefined, and the entry when it empties', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setDisplayOverride({kind: 'model'}, {color: 'source'})
    })
    await act(() => {
      result.current.setDisplayOverride({kind: 'model'}, {color: undefined})
    })
    // Empty appearance -> no entry, so an all-default model carries nothing
    // (keeps the permalink empty).
    expect(result.current.displayOverrides.model).toBeUndefined()
  })

  it('keeps distinct scopes independent', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      result.current.setDisplayOverride({kind: 'model'}, {color: 'auto'})
      result.current.setDisplayOverride({kind: 'element', ref: 42}, {shading: 'wireframe'})
    })
    expect(result.current.getDisplayOverrideList()).toHaveLength(2)
    await act(() => {
      result.current.clearDisplayOverride({kind: 'element', ref: 42})
    })
    expect(result.current.getDisplayOverrideList()).toEqual([
      {scope: {kind: 'model'}, appearance: {color: 'auto'}},
    ])
  })
})
