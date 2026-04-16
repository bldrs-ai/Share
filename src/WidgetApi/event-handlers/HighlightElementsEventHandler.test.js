// Characterization tests for HighlightElementsEventHandler. See
// HideElementsEventHandler.test.js for scope.

import AbstractApiConnection from '../ApiConnection'
import HighlightElementsEventHandler from './HighlightElementsEventHandler'


let mockLastSetState = null

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    setState: jest.fn((update) => {
      mockLastSetState = update
    }),
  },
}))


describe('WidgetApi/event-handlers/HighlightElementsEventHandler', () => {
  let apiConnection
  let searchIndex

  beforeEach(() => {
    mockLastSetState = null
    apiConnection = new AbstractApiConnection()
    searchIndex = {getExpressIdByGlobalId: jest.fn()}
  })


  it('exposes the canonical event name', () => {
    const handler = new HighlightElementsEventHandler(apiConnection, searchIndex)
    expect(handler.name).toBe('ai.bldrs-share.HighlightElements')
  })


  it('returns missing-argument when globalIds is absent', () => {
    const handler = new HighlightElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({})
    expect(result).toEqual({error: true, reason: 'Missing argument globalIds'})
    expect(mockLastSetState).toBeNull()
  })


  it('returns invalid-operation when globalIds is null', () => {
    const handler = new HighlightElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: null})
    expect(result).toEqual({error: true, reason: 'globalIds can\'t be null'})
    expect(mockLastSetState).toBeNull()
  })


  it('writes an empty preselection when globalIds is an empty array', () => {
    const handler = new HighlightElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: []})
    expect(mockLastSetState).toEqual({preselectedElementIds: []})
  })


  // TODO: HighlightElementsEventHandler writes raw string expressIds into
  // preselectedElementIds, unlike HideElementsEventHandler which coerces
  // via `.map(Number)`. This is inconsistent across handlers. Refactor
  // target: pick one convention (numbers or strings) and apply it to all
  // element-id-carrying events.
  it('writes raw string expressIds (no numeric coercion)', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation((id) => ({
      'gid-a': '10',
      'gid-b': '20',
    })[id])

    const handler = new HighlightElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: ['gid-a', 'gid-b']})

    expect(mockLastSetState).toEqual({preselectedElementIds: ['10', '20']})
  })


  it('drops unresolved globalIds', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation(
      (id) => (id === 'known' ? '7' : undefined),
    )

    const handler = new HighlightElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: ['known', 'ghost']})

    expect(mockLastSetState).toEqual({preselectedElementIds: ['7']})
  })
})
