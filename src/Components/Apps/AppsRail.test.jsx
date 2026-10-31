import React from 'react'
import {act, fireEvent, render, renderHook} from '@testing-library/react'
import ShareMock from '../../ShareMock'
import useStore from '../../store/useStore'
import AppEntry from './AppEntry'
import AppsRail from './AppsRail'
import AppsRegistry from './AppsRegistry.json'


const exampleApp = AppsRegistry[0]
// The bar is part of the workspace shell; without the flag it never shows.
const WORKSPACE = ['/?feature=workspace']


describe('AppsRail', () => {
  let store
  beforeEach(() => {
    store = renderHook(() => useStore((state) => state)).result
    act(() => {
      useStore.setState({isAppsEnabled: true})
      store.current.setIsAppsVisible(false)
      store.current.setSelectedApp(null)
      store.current.runningApps.forEach((app) => store.current.closeRunningApp(app.appName))
      store.current.pinnedAppNames.forEach((name) => store.current.togglePinnedApp(name))
    })
  })


  it('renders nothing when no app is running or pinned', () => {
    const {queryByTestId} = render(<ShareMock initialEntries={WORKSPACE}><AppsRail/></ShareMock>)
    expect(queryByTestId('AppsRail')).toBeNull()
  })


  it('docks a running app, which opens the drawer on it and closes from the bar', () => {
    act(() => {
      store.current.setSelectedApp(exampleApp)
    })
    const {getByTestId, queryByTestId} = render(<ShareMock initialEntries={WORKSPACE}><AppsRail/></ShareMock>)
    expect(getByTestId(`apps-rail-${exampleApp.appName}`)).toBeInTheDocument()

    act(() => {
      store.current.setSelectedApp(null)
    })
    fireEvent.click(getByTestId(`apps-rail-open-${exampleApp.appName}`))
    expect(store.current.isAppsVisible).toBe(true)
    expect(store.current.selectedApp?.appName).toBe(exampleApp.appName)
    // The drawer is open, so the bar steps aside.
    expect(queryByTestId('AppsRail')).toBeNull()

    act(() => {
      store.current.setIsAppsVisible(false)
    })
    fireEvent.click(getByTestId(`apps-rail-close-${exampleApp.appName}`))
    expect(store.current.runningApps).toHaveLength(0)
    expect(store.current.selectedApp).toBeNull()
    expect(queryByTestId('AppsRail')).toBeNull()
  })


  it('docks a pinned app without a close badge', () => {
    act(() => {
      store.current.togglePinnedApp(exampleApp.appName)
    })
    const {getByTestId, queryByTestId} = render(<ShareMock initialEntries={WORKSPACE}><AppsRail/></ShareMock>)
    expect(getByTestId(`apps-rail-${exampleApp.appName}`)).toBeInTheDocument()
    expect(queryByTestId(`apps-rail-close-${exampleApp.appName}`)).toBeNull()
  })


  it('renders nothing while Apps is disabled, even with a pinned app', () => {
    act(() => {
      store.current.togglePinnedApp(exampleApp.appName)
      useStore.setState({isAppsEnabled: false})
    })
    const {queryByTestId} = render(<ShareMock initialEntries={WORKSPACE}><AppsRail/></ShareMock>)
    expect(queryByTestId('AppsRail')).toBeNull()
  })


  it('renders nothing without the workspace flag', () => {
    act(() => {
      store.current.togglePinnedApp(exampleApp.appName)
    })
    const {queryByTestId} = render(<ShareMock><AppsRail/></ShareMock>)
    expect(queryByTestId('AppsRail')).toBeNull()
  })


  it('AppEntry pin control reflects and toggles the pinned state', () => {
    const onTogglePin = jest.fn()
    const {getByTestId, rerender} = render(
      <AppEntry itemJson={exampleApp} onClickCb={() => {}} isPinned={false} onTogglePin={onTogglePin}/>,
    )
    const pin = getByTestId(`app-pin-${exampleApp.appName}`)
    expect(pin).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pin)
    expect(onTogglePin).toHaveBeenCalledTimes(1)
    rerender(<AppEntry itemJson={exampleApp} onClickCb={() => {}} isPinned onTogglePin={onTogglePin}/>)
    expect(getByTestId(`app-pin-${exampleApp.appName}`)).toHaveAttribute('aria-pressed', 'true')
  })
})
