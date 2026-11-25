// Characterization tests for ChangeViewSettingsEventHandler. See
// HideElementsEventHandler.test.js for scope.

import AbstractApiConnection from '../ApiConnection'
import ChangeViewSettingsEventHandler from './ChangeViewSettingsEventHandler'


describe('WidgetApi/event-handlers/ChangeViewSettingsEventHandler', () => {
  let apiConnection

  beforeEach(() => {
    apiConnection = new AbstractApiConnection()
  })


  it('exposes the canonical event name', () => {
    const handler = new ChangeViewSettingsEventHandler(apiConnection)
    expect(handler.name).toBe('ai.bldrs-share.ChangeViewSettings')
  })


  it('returns missing-argument when customViewSettings is absent', () => {
    const handler = new ChangeViewSettingsEventHandler(apiConnection)
    const result = handler.handler({})
    expect(result).toEqual({error: true, reason: 'Missing argument customViewSettings'})
  })


  // The `?view=` rules stack is gone (layering.md §7, slice V): an embedder's
  // settings are accepted and not applied, so it sees no error.
  it('answers success for settings, null included', () => {
    const payload = {
      defaultColor: {r: 1, g: 0, b: 0, a: 1},
      expressIdsToColorMap: {10: {r: 0, g: 1, b: 0, a: 1}},
      globalIdsToColorMap: {'gid-a': {r: 0, g: 0, b: 1, a: 1}},
    }
    const handler = new ChangeViewSettingsEventHandler(apiConnection)
    expect(handler.handler({customViewSettings: payload})).toEqual({error: false})
    expect(handler.handler({customViewSettings: null})).toEqual({error: false})
  })
})
