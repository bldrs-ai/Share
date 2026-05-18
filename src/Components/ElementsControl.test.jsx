import React from 'react'
import {__getShareViewerMockSingleton} from 'web-ifc-viewer'
import {act, render, fireEvent, renderHook} from '@testing-library/react'
import ShareMock from '../ShareMock'
import useStore from '../store/useStore'
import ElementsControl from './ElementsControl'


// State-source contract:
//
//   - Isolation visibility is driven by the store's `isTempIsolationModeOn`
//     (written by the isolator's isolateSelectedElements /
//     resetTempIsolation).
//   - Hide-state visibility is driven by `hiddenElements` (written by
//     hideElementsById / unHideAllElements).
//   - The component itself holds NO local copy of either — these
//     tests reset both before each case to keep state from leaking
//     across test files run together (useStore is a module-singleton).
//
// `selectedElement`, the third source, was already store-backed.
describe('ElementsControl', () => {
  let deselectItems
  let viewer

  beforeAll(async () => {
    deselectItems = jest.fn()
    const {result} = renderHook(() => useStore((state) => state))
    viewer = __getShareViewerMockSingleton()
    viewer.isolator = {
      toggleIsolationMode: jest.fn(),
      hideSelectedElements: jest.fn(),
      unHideAllElements: jest.fn(),
    }
    await act(() => {
      result.current.setViewer(viewer)
    })
  })

  beforeEach(async () => {
    const {result} = renderHook(() => useStore((state) => state))
    await act(() => {
      // Reset both isolator-related store keys and selection so each
      // test starts from a known idle state.
      result.current.setSelectedElement(null)
      result.current.setHiddenElements({})
      result.current.setIsTempIsolationModeOn(false)
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })


  describe('idle state (no selection, nothing hidden, not isolated)', () => {
    it('renders CutPlaneMenu', () => {
      const {queryByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      expect(queryByTitle('Section')).toBeInTheDocument()
    })

    it('hides the selection-gated buttons (Isolate / Hide / Clear / Show all)', () => {
      const {queryByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      expect(queryByTitle('Isolate')).not.toBeInTheDocument()
      expect(queryByTitle('Hide')).not.toBeInTheDocument()
      expect(queryByTitle('Clear')).not.toBeInTheDocument()
      expect(queryByTitle('Show all')).not.toBeInTheDocument()
    })
  })


  describe('with a selection', () => {
    beforeEach(async () => {
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setSelectedElement({id: 123})
      })
    })

    it('renders Clear and routes through deselectItems', () => {
      const {queryByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      const clearButton = queryByTitle('Clear')
      expect(clearButton).toBeInTheDocument()
      fireEvent.click(clearButton)
      expect(deselectItems).toHaveBeenCalled()
    })

    it('renders Hide and routes through isolator.hideSelectedElements', () => {
      const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      fireEvent.click(getByTitle('Hide'))
      expect(viewer.isolator.hideSelectedElements).toHaveBeenCalled()
    })

    it('renders Isolate and routes through isolator.toggleIsolationMode', () => {
      const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      fireEvent.click(getByTitle('Isolate'))
      expect(viewer.isolator.toggleIsolationMode).toHaveBeenCalled()
    })
  })


  describe('isolation state (out-of-sync regression coverage)', () => {
    it('keeps the Isolate button visible after deselecting mid-isolation', async () => {
      // The exact "no way out" bug: pre-fix, the Isolate button was
      // gated on `selectedElement !== null`. Entering isolation,
      // then deselecting (Esc / Clear / a programmatic click on
      // empty space), hid the Isolate button — leaving keyboard
      // shortcuts as the only escape. Post-fix, the button is also
      // gated on the store's `isTempIsolationModeOn`, so it stays.
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setSelectedElement(null)
        result.current.setIsTempIsolationModeOn(true)
      })
      const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      const isolate = getByTitle('Isolate')
      expect(isolate).toBeInTheDocument()
      fireEvent.click(isolate)
      expect(viewer.isolator.toggleIsolationMode).toHaveBeenCalled()
    })

    it('hides CutPlaneMenu / Hide / Show-all during isolation', async () => {
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setSelectedElement({id: 123})
        result.current.setHiddenElements({99: true})
        result.current.setIsTempIsolationModeOn(true)
      })
      const {queryByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      // CutPlaneMenu hidden during isolation (existing behaviour).
      expect(queryByTitle('Section')).not.toBeInTheDocument()
      // Hide is a no-op during isolation per the isolator guard, so
      // don't surface it.
      expect(queryByTitle('Hide')).not.toBeInTheDocument()
      // Same reasoning for Show all (unHideAllElements is gated).
      expect(queryByTitle('Show all')).not.toBeInTheDocument()
      // Isolate + Clear stay visible.
      expect(queryByTitle('Isolate')).toBeInTheDocument()
      expect(queryByTitle('Clear')).toBeInTheDocument()
    })
  })


  describe('hidden state (out-of-sync regression coverage)', () => {
    it('renders Show all whenever any element is hidden, regardless of UI provenance', async () => {
      // Pre-fix, Show all visibility was driven by a local React
      // state that only flipped when the user clicked Hide in THIS
      // component. Hiding via the NavTree's eye icon, via keyboard
      // `H`, or programmatically left the button hidden — no way
      // to undo. Post-fix, Show all follows the store's
      // `hiddenElements`.
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setHiddenElements({42: true})
      })
      const {getByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      const showAll = getByTitle('Show all')
      expect(showAll).toBeInTheDocument()
      fireEvent.click(showAll)
      expect(viewer.isolator.unHideAllElements).toHaveBeenCalled()
    })

    it('hides Show all when hiddenElements has only false / cleared entries', async () => {
      // `unHideElementsById` writes `false` into existing slots
      // rather than deleting them. The visibility predicate must
      // treat those as "not hidden" — otherwise Show all sticks
      // around after a full unhide.
      const {result} = renderHook(() => useStore((state) => state))
      await act(() => {
        result.current.setHiddenElements({42: false, 99: false})
      })
      const {queryByTitle} = render(
        <ShareMock initialEntries={['/v/p/index.ifc#p:x']}>
          <ElementsControl deselectItems={deselectItems}/>
        </ShareMock>,
      )
      expect(queryByTitle('Show all')).not.toBeInTheDocument()
    })
  })
})
