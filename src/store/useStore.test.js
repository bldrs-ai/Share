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
})

describe('UI slice', () => {
  it('Set Drawer State', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.openDrawer()
    })
    expect(result.current.isDrawerOpen).toEqual(true)
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
})

describe('IFC slice', () => {
  it('set IFC model', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setModel({castShadow: false})
    })
    expect(result.current.model).toEqual(
        {castShadow: false},
    )
  })
})

describe('IFC slice', () => {
  it('set IFC viewer', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setViewer({GLTF: {GLTFModels: {}}})
    })
    expect(result.current.viewer).toEqual(
        {GLTF: {GLTFModels: {}}},
    )
  })
})
