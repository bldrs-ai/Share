import React from 'react'
import {act, fireEvent, render, renderHook, screen, waitFor} from '@testing-library/react'
import {captureException} from '@sentry/react'
import {RouteThemeCtx} from '../../Share.fixture'
import useStore from '../../store/useStore'
import {MockModel} from '../../utils/IfcMock.test'
import {PROPERTIES_UNAVAILABLE_MESSAGE} from './Properties'
import PropertiesPanel, {PROPERTIES_RENDER_FAILED_MESSAGE} from './PropertiesPanel'
import {createPropertyTable} from './itemProperties'
import {TITLE} from './component'


// Asserted on: the panel's catches must still report (Properties.jsx).
jest.mock('@sentry/react', () => ({...jest.requireActual('@sentry/react'), captureException: jest.fn()}))
// Only the containment tests below replace it; everything else gets the
// real table builder.
jest.mock('./itemProperties', () => {
  const actual = jest.requireActual('./itemProperties')
  return {...actual, createPropertyTable: jest.fn(actual.createPropertyTable)}
})


describe('PropertiesPanel', () => {
  it('renders', async () => {
    const {result} = renderHook(() => useStore((state) => state))
    const {getByText} = render(<PropertiesPanel/>, {wrapper: RouteThemeCtx})
    await act(() => {
      result.current.setSelectedNoteId(null)
    })
    expect(getByText(TITLE)).toBeInTheDocument()
  })
})


/** Throws while rendering, as a raw object handed to React does (#31). */
function ThrowsOnRender() {
  throw new Error('Objects are not valid as a React child')
}


/**
 * Share#2063: one element's properties took the whole app down, because a
 * render throw inside the panel reached the root ErrorBoundary. Whatever the
 * properties hold, a failure must cost the panel and nothing else.
 */
describe('PropertiesPanel contains a failure to show properties', () => {
  let consoleError
  let consoleWarn
  beforeEach(() => {
    // React reports an error its boundary caught on console.error; the
    // panel's catch below warns. Both are asserted, not just muted.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => null)
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => null)
    captureException.mockClear()
  })
  afterEach(() => {
    consoleError.mockRestore()
    consoleWarn.mockRestore()
    createPropertyTable.mockImplementation(jest.requireActual('./itemProperties').createPropertyTable)
    act(() => useStore.setState({selectedElement: null, model: null}))
  })

  /**
   * @param {number} expressID
   */
  async function select(expressID) {
    await act(() => {
      useStore.setState({
        model: new MockModel({1: {expressID: 1}, 2: {expressID: 2, Name: {type: 1, value: 'Second'}}}),
        selectedElement: {expressID},
      })
    })
  }

  it('a table that throws while rendering shows a message in the panel, and the rest stays up', async () => {
    createPropertyTable.mockImplementation(() => Promise.resolve(<ThrowsOnRender/>))
    await select(1)
    render(
      <>
        <div data-testid='outside-the-panel'/>
        <PropertiesPanel/>
      </>,
      {wrapper: RouteThemeCtx})
    expect(await screen.findByText(PROPERTIES_RENDER_FAILED_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText(TITLE)).toBeInTheDocument()
    expect(screen.getByTestId('outside-the-panel')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
  })

  it('selecting another element after a failure shows its properties', async () => {
    createPropertyTable.mockImplementation(() => Promise.resolve(<ThrowsOnRender/>))
    await select(1)
    render(<PropertiesPanel/>, {wrapper: RouteThemeCtx})
    await screen.findByText(PROPERTIES_RENDER_FAILED_MESSAGE)
    createPropertyTable.mockImplementation(jest.requireActual('./itemProperties').createPropertyTable)
    await select(2)
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(screen.queryByText(PROPERTIES_RENDER_FAILED_MESSAGE)).not.toBeInTheDocument()
  })

  it('a table that cannot be built replaces the previous element\'s properties with a message', async () => {
    await select(2)
    render(<PropertiesPanel/>, {wrapper: RouteThemeCtx})
    expect(await screen.findByText('Second')).toBeInTheDocument()
    createPropertyTable.mockImplementation(() => Promise.reject(new Error('Unknown reference type')))
    await select(1)
    expect(await screen.findByText(PROPERTIES_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Second')).not.toBeInTheDocument())
    expect(consoleWarn).toHaveBeenCalledWith('Properties: could not build the property table', expect.any(Error))
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Unknown reference type'}),
      expect.objectContaining({tags: {component: 'Properties', part: 'table'}, extra: {expressID: 1}}))
  })

  it('a failure at the swap to the finished model is retried with that model', async () => {
    createPropertyTable.mockImplementation(() => Promise.resolve(<ThrowsOnRender/>))
    await select(2)
    render(<PropertiesPanel/>, {wrapper: RouteThemeCtx})
    await screen.findByText(PROPERTIES_RENDER_FAILED_MESSAGE)
    createPropertyTable.mockImplementation(jest.requireActual('./itemProperties').createPropertyTable)
    // Same selection, new model: what the indexed → finished hand-off does.
    await act(() => {
      useStore.setState({model: new MockModel({2: {expressID: 2, Name: {type: 1, value: 'Second'}}})})
    })
    expect(await screen.findByText('Second')).toBeInTheDocument()
  })
})


/**
 * The boundary must not remount <Properties/> on a healthy selection change:
 * its state (here the property-set expand-all toggle) belongs to the panel,
 * not to one element.
 */
describe('PropertiesPanel keeps the panel\'s state across selections', () => {
  afterEach(() => {
    act(() => useStore.setState({selectedElement: null, model: null}))
  })

  it('expand-all stays on after selecting another element', async () => {
    const model = new MockModel({1: {expressID: 1, Name: {type: 1, value: 'First'}}, 2: {expressID: 2, Name: {type: 1, value: 'Second'}}})
    model.getPropertySets = () => Promise.resolve([{expressID: 50, Name: {value: 'Pset_Common'}}])
    await act(() => useStore.setState({model, selectedElement: {expressID: 1}}))
    render(<PropertiesPanel/>, {wrapper: RouteThemeCtx})
    await screen.findByText('First')
    const toggle = await screen.findByRole('checkbox')
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
    await act(() => useStore.setState({selectedElement: {expressID: 2}}))
    await screen.findByText('Second')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
