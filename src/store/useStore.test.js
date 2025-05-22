import {act, renderHook} from '@testing-library/react'
import useStore from './useStore'


describe('UI slice', () => {
  it('Set snack message', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setSnackMessage(['loading'])
    })
    expect(result.current.snackMessage).toEqual(['loading'])
  })


  it('Set Drawer State', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setIsSideDrawerEnabled(true)
    })
    expect(result.current.isSideDrawerEnabled).toEqual(true)
  })
})


describe('IFC slice', () => {
  it('select an IFC element', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setSelectedElement(
          {Name: {
            type: 1,
            value: 'Together',
          },
          })
    })
    expect(result.current.selectedElement).toEqual({Name: {
      type: 1,
      value: 'Together',
    },
    })
  })


  it('set IFC model', () => {
    const {result} = renderHook(() => useStore((state) => state))
    const model = {castShadow: false}
    act(() => {
      result.current.setModel(model)
    })
    expect(result.current.model).toEqual(model)
  })


  it('set IFC viewer', () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = {GLTF: {GLTFModels: {}}}
    act(() => {
      result.current.setViewer(viewer)
    })
    expect(result.current.viewer).toEqual(viewer)
  })
})

describe('Repository slice', () => {
  it('sets and clears repository', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setRepository('testOrg', 'testRepo')
    })
    expect(result.current.repository).toEqual({orgName: 'testOrg', name: 'testRepo'})

    act(() => {
      result.current.setRepository()
    })
    expect(result.current.repository).toBeNull()
  })
})
