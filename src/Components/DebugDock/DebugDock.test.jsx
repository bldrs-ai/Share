import React from 'react'
import {act, fireEvent, render} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import {setPerfVisible} from '../../utils/PerfMonitor'
import {resetDebugPanelsForTest, setRenderPanelShown} from '../../viewer/debugPanels'
import DebugDock from './DebugDock'


describe('DebugDock', () => {
  beforeEach(() => {
    resetDebugPanelsForTest()
    act(() => {
      setPerfVisible(false)
      setRenderPanelShown(false)
    })
  })

  afterEach(() => {
    act(() => {
      setPerfVisible(false)
      setRenderPanelShown(false)
      useStore.setState({viewer: null})
    })
    delete window.perf
  })

  it('renders nothing while both panels are hidden', () => {
    const {queryByTestId} = render(<ShareMock><DebugDock/></ShareMock>)
    expect(queryByTestId('debug-dock')).toBeNull()
  })

  it('shows Perf expanded with its graphs and counts, and minimises it to fps/ms/MB', () => {
    const {getByTestId, queryByTestId} = render(<ShareMock><DebugDock/></ShareMock>)
    act(() => setPerfVisible(true))
    expect(getByTestId('perf-panel-graphs').querySelector('#perf-monitor')).not.toBeNull()
    const counts = getByTestId('perf-panel-counts').textContent
    for (const label of ['Geometries', 'Textures', 'Draw calls', 'Triangles']) {
      expect(counts).toContain(label)
    }
    expect(queryByTestId('perf-panel-summary')).toBeNull()

    fireEvent.click(getByTestId('perf-panel-title'))
    expect(queryByTestId('perf-panel-counts')).toBeNull()
    expect(getByTestId('perf-panel-summary').textContent).toMatch(/^\S+\/\S+\/\S+$/)
  })

  it('mounts the Render panel into its host on the current viewer, Perf to its left', () => {
    const viewer = {mountLookPanel: jest.fn(() => true), unmountLookPanel: jest.fn()}
    act(() => useStore.setState({viewer}))
    const {getByTestId} = render(<ShareMock><DebugDock/></ShareMock>)
    act(() => {
      setPerfVisible(true)
      setRenderPanelShown(true)
    })
    const host = getByTestId('render-panel-host')
    expect(viewer.mountLookPanel).toHaveBeenCalledWith(host, expect.any(Function))
    const dock = getByTestId('debug-dock')
    expect([...dock.children].map((el) => el.dataset.testid)).toEqual(['perf-panel', 'render-panel-host'])

    act(() => setRenderPanelShown(false))
    expect(viewer.unmountLookPanel).toHaveBeenCalled()
  })
})
