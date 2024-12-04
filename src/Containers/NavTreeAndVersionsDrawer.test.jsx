import React from 'react'
import {__getIfcViewerAPIExtendedMockSingleton} from 'web-ifc-viewer'
import {act, render, renderHook, fireEvent} from '@testing-library/react'
import {useIsMobile} from '../Components/Hooks'
import {TITLE as TITLE_NAV_TREE} from '../Components/NavTree/NavTreePanel'
import {TITLE as TITLE_VERSIONS} from '../Components/Versions/VersionsPanel'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import NavTreeAndVersionsDrawer from './NavTreeAndVersionsDrawer'
import {
  MOCK_MODEL_PATH_GIT,
  MOCK_REPOSITORY,
} from '../Components/Versions/VersionsPanel.fixture'


describe('NavTreeAndVersionsDrawer', () => {
  beforeAll(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const viewer = __getIfcViewerAPIExtendedMockSingleton()
    viewer.isolator = {
      toggleIsolationMode: jest.fn(),
      hideSelectedElements: jest.fn(),
      unHideAllElements: jest.fn(),
      canBeHidden: jest.fn(),
    }
    await act(() => {
      result.current.setViewer(viewer)
    })
  })

  it('properties panel renders', async () => {
    const {result: {current: store}} = renderHook(() => useStore((state) => state))
    await act(() => {
      store.setModel({getIfcType: jest.fn()})
      store.setModelPath({})
      store.setRootElement({expressID: 0, children: []})
    })
    const {findByText} = render(
      <ShareMock>
        <NavTreeAndVersionsDrawer pathPrefix='' branch='' selectWithShiftClickEvents={jest.fn()}/>
      </ShareMock>)
    await act(() => {
      store.setIsNavTreeVisible(true)
    })
    expect(await findByText(TITLE_NAV_TREE)).toBeVisible()
    // reset the store
    await act(() => {
      store.setSelectedElement({})
      store.toggleIsPropertiesVisible()
    })
  })

  it('double-click resizes horizontally', async () => {
    const mobileHook = renderHook(() => useIsMobile())
    const {result: {current: store}} = renderHook(() => useStore((state) => state))
    await act(() => {
      // NavTree
      store.setModel({getIfcType: jest.fn()})
      store.setModelPath({})
      store.setRootElement({expressID: 0, children: []})
      // Versions
      store.setModelPath(MOCK_MODEL_PATH_GIT)
      store.setRepository(MOCK_REPOSITORY)
      // TODO(pablo): use mock commit data
    })
    const notesAndPropsRender = render(
      <ShareMock>
        <NavTreeAndVersionsDrawer pathPrefix='' branch='' selectWithShiftClickEvents={jest.fn()}/>
      </ShareMock>)
    await act(() => {
      store.setIsVersionsVisible(true)
    })
    expect(await notesAndPropsRender.findByText(TITLE_VERSIONS)).toBeVisible()
    expect(mobileHook.result.current).toBe(false)
    const leftDrawerWidthInitial = store.leftDrawerWidthInitial
    const xResizerEl = notesAndPropsRender.getByTestId('x_resizer')
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    const expectedWidth = 350 // TODO(pablo): hack, should be window.innerWidth
    expect(store.leftDrawerWidth).toBe(expectedWidth)
    fireEvent.click(xResizerEl)
    fireEvent.click(xResizerEl)
    expect(store.leftDrawerWidth).toBe(leftDrawerWidthInitial)
  })
})
