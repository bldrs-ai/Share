// Characterization tests for ChangeViewSettingsEventHandler. See
// HideElementsEventHandler.test.js for scope.

import AbstractApiConnection from '../ApiConnection'
import IfcCustomViewSettings from '../../Infrastructure/IfcCustomViewSettings'
import ChangeViewSettingsEventHandler from './ChangeViewSettingsEventHandler'


let mockLastSetState = null

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    setState: jest.fn((update) => {
      mockLastSetState = update
    }),
  },
}))


describe('WidgetApi/event-handlers/ChangeViewSettingsEventHandler', () => {
  let apiConnection

  beforeEach(() => {
    mockLastSetState = null
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
    expect(mockLastSetState).toBeNull()
  })


  it('wraps the incoming payload in an IfcCustomViewSettings and writes it to the store', () => {
    const payload = {
      defaultColor: {r: 1, g: 0, b: 0, a: 1},
      expressIdsToColorMap: {10: {r: 0, g: 1, b: 0, a: 1}},
      globalIdsToColorMap: {'gid-a': {r: 0, g: 0, b: 1, a: 1}},
    }

    const handler = new ChangeViewSettingsEventHandler(apiConnection)
    const result = handler.handler({customViewSettings: payload})

    expect(result).toEqual({error: false})
    expect(mockLastSetState).not.toBeNull()
    expect(mockLastSetState.customViewSettings).toBeInstanceOf(IfcCustomViewSettings)
    expect(mockLastSetState.customViewSettings.defaultColor).toBe(payload.defaultColor)
    expect(mockLastSetState.customViewSettings.expressIdsToColorMap).toBe(payload.expressIdsToColorMap)
    expect(mockLastSetState.customViewSettings.globalIdsToColorMap).toBe(payload.globalIdsToColorMap)
  })


  // TODO: ChangeViewSettingsEventHandler has no null-check on
  // customViewSettings (unlike every other handler which rejects null
  // explicitly). A call with {customViewSettings: null} crashes trying to
  // read .defaultColor off null. Refactor target: add the null guard for
  // consistency with the other handlers.
  it('crashes on null customViewSettings (missing null-guard)', () => {
    const handler = new ChangeViewSettingsEventHandler(apiConnection)
    expect(() => handler.handler({customViewSettings: null})).toThrow(TypeError)
  })
})
