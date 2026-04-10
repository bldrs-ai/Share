/* eslint-disable no-magic-numbers */
import AbstractApiConnection from '../ApiConnection'
import SelectElementsEventHandler from './SelectElementsEventHandler'


// Mock useStore so we can:
//   1. stub `state.viewer.isolator.canBePickedInScene` for filter logic, and
//   2. capture the setState call the handler makes.
// Names must be `mock`-prefixed so jest's out-of-scope guard allows access
// from the hoisted mock factory.
let mockPickable = new Set()
let mockLastSetState = null

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      viewer: {
        isolator: {
          canBePickedInScene: (id) => mockPickable.has(id),
        },
      },
    })),
    setState: jest.fn((update) => {
      mockLastSetState = update
    }),
  },
}))


describe('WidgetApi/event-handlers/SelectElementsEventHandler', () => {
  let apiConnection
  let searchIndex

  beforeEach(() => {
    mockPickable = new Set()
    mockLastSetState = null

    apiConnection = new AbstractApiConnection()

    searchIndex = {
      getExpressIdByGlobalId: jest.fn(),
    }
  })


  it('exposes the canonical event name', () => {
    const handler = new SelectElementsEventHandler(apiConnection, searchIndex)
    expect(handler.name).toBe('ai.bldrs-share.SelectElements')
  })


  it('returns a missing-argument response when globalIds is absent', () => {
    const handler = new SelectElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({})

    expect(result).toEqual({error: true, reason: 'Missing argument globalIds'})
    expect(mockLastSetState).toBeNull()
  })


  it('returns an invalid-operation response when globalIds is null', () => {
    const handler = new SelectElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: null})

    expect(result).toEqual({error: true, reason: 'globalIds can\'t be null'})
    expect(mockLastSetState).toBeNull()
  })


  it('returns a successful, empty selection when globalIds is an empty array', () => {
    const handler = new SelectElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: []})

    expect(result).toEqual({error: false})
    expect(mockLastSetState).toEqual({selectedElements: []})
  })


  it('translates globalIds to expressIds via the searchIndex and filters by canBePickedInScene', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation((globalId) => {
      const table = {'gid-a': '10', 'gid-b': '20', 'gid-c': '30'}
      return table[globalId]
    })
    mockPickable = new Set([10, 30]) // 20 is not pickable

    const handler = new SelectElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: ['gid-a', 'gid-b', 'gid-c']})

    expect(result).toEqual({error: false})
    expect(mockLastSetState).toEqual({selectedElements: [10, 30]})
  })


  it('silently drops globalIds that the searchIndex does not resolve', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation((globalId) => {
      return globalId === 'known' ? '5' : undefined
    })
    mockPickable = new Set([5])

    const handler = new SelectElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: ['known', 'unknown-1', 'unknown-2']})

    expect(result).toEqual({error: false})
    expect(mockLastSetState).toEqual({selectedElements: [5]})
  })
})
