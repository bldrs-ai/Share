// Characterization tests for UIComponentsVisibilityEventHandler. See
// HideElementsEventHandler.test.js for scope.

import AbstractApiConnection from '../ApiConnection'
import UIComponentsVisibilityEventHandler from './UIComponentsVisibilityEventHandler'


// TODO: This handler calls five setters that DO NOT EXIST on any slice
// and are all misspelled (`Visibile` with an extra `i`):
//
//   - setIsSearchbarVisibile      (slice has setIsSearchBarVisible)
//   - setIsNavigationPanelVisibile(slice has setIsNavTreeVisible)
//   - setIsCollaborationGroupVisibile  (no such setter anywhere)
//   - setIsModelInteractionGroupVisibile (no such setter anywhere)
//   - setIsSettingsVisibile       (no such setter anywhere)
//
// Calling this handler with ANY of these keys against the real composed
// store would throw "X is not a function". The mock below defines the
// misspelled names so the test can pin current call semantics — the
// handler's wiring is entirely broken in production. Refactor target:
// replace these with real slice setters and fix the name casing.
const mockSetters = {
  setIsSearchbarVisibile: jest.fn(),
  setIsNavigationPanelVisibile: jest.fn(),
  setIsCollaborationGroupVisibile: jest.fn(),
  setIsModelInteractionGroupVisibile: jest.fn(),
  setIsSettingsVisibile: jest.fn(),
}

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => mockSetters),
  },
}))


describe('WidgetApi/event-handlers/UIComponentsVisibilityEventHandler', () => {
  let apiConnection

  beforeEach(() => {
    Object.values(mockSetters).forEach((fn) => fn.mockClear())
    apiConnection = new AbstractApiConnection()
  })


  it('exposes the canonical event name', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    expect(handler.name).toBe('ai.bldrs-share.UIComponentsVisibility')
  })


  it('returns a successful empty response even when data is empty', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    const result = handler.handler({})
    expect(result).toEqual({error: false})
    for (const fn of Object.values(mockSetters)) {
      expect(fn).not.toHaveBeenCalled()
    }
  })


  it('forwards searchBar -> setIsSearchbarVisibile (misspelled)', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    handler.handler({searchBar: true})
    expect(mockSetters.setIsSearchbarVisibile).toHaveBeenCalledWith(true)
  })


  it('forwards navigationPanel -> setIsNavigationPanelVisibile (misspelled)', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    handler.handler({navigationPanel: false})
    expect(mockSetters.setIsNavigationPanelVisibile).toHaveBeenCalledWith(false)
  })


  it('forwards collaboration -> setIsCollaborationGroupVisibile (misspelled)', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    handler.handler({collaboration: true})
    expect(mockSetters.setIsCollaborationGroupVisibile).toHaveBeenCalledWith(true)
  })


  it('forwards modelInteraction -> setIsModelInteractionGroupVisibile (misspelled)', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    handler.handler({modelInteraction: false})
    expect(mockSetters.setIsModelInteractionGroupVisibile).toHaveBeenCalledWith(false)
  })


  it('forwards settings -> setIsSettingsVisibile (misspelled)', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    handler.handler({settings: true})
    expect(mockSetters.setIsSettingsVisibile).toHaveBeenCalledWith(true)
  })


  it('handles a full payload with all five keys at once', () => {
    const handler = new UIComponentsVisibilityEventHandler(apiConnection)
    handler.handler({
      searchBar: true,
      navigationPanel: true,
      collaboration: false,
      modelInteraction: true,
      settings: false,
    })
    expect(mockSetters.setIsSearchbarVisibile).toHaveBeenCalledWith(true)
    expect(mockSetters.setIsNavigationPanelVisibile).toHaveBeenCalledWith(true)
    expect(mockSetters.setIsCollaborationGroupVisibile).toHaveBeenCalledWith(false)
    expect(mockSetters.setIsModelInteractionGroupVisibile).toHaveBeenCalledWith(true)
    expect(mockSetters.setIsSettingsVisibile).toHaveBeenCalledWith(false)
  })
})
