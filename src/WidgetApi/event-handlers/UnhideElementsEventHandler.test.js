/* eslint-disable no-magic-numbers */
// Characterization tests for UnhideElementsEventHandler. See the note in
// HideElementsEventHandler.test.js for scope — these pin current behavior
// ahead of a planned WidgetApi refactor.

import AbstractApiConnection from '../ApiConnection'
import UnhideElementsEventHandler from './UnhideElementsEventHandler'


const mockUnHideAllElements = jest.fn()
const mockUnHideElementsById = jest.fn()

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      viewer: {
        isolator: {
          unHideAllElements: mockUnHideAllElements,
          unHideElementsById: mockUnHideElementsById,
        },
      },
    })),
  },
}))


describe('WidgetApi/event-handlers/UnhideElementsEventHandler', () => {
  let apiConnection
  let searchIndex

  beforeEach(() => {
    mockUnHideAllElements.mockClear()
    mockUnHideElementsById.mockClear()
    apiConnection = new AbstractApiConnection()
    searchIndex = {getExpressIdByGlobalId: jest.fn()}
  })


  it('exposes the canonical event name', () => {
    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    expect(handler.name).toBe('ai.bldrs-share.UnhideElements')
  })


  it('returns missing-argument when globalIds is absent', () => {
    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({})
    expect(result).toEqual({error: true, reason: 'Missing argument globalIds'})
    expect(mockUnHideAllElements).not.toHaveBeenCalled()
    expect(mockUnHideElementsById).not.toHaveBeenCalled()
  })


  it('returns invalid-operation when globalIds is null', () => {
    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: null})
    expect(result).toEqual({error: true, reason: 'globalIds can\'t be null'})
  })


  it('"*" triggers unHideAllElements', () => {
    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: '*'})

    expect(result).toEqual({error: false})
    expect(mockUnHideAllElements).toHaveBeenCalledTimes(1)
    expect(mockUnHideElementsById).not.toHaveBeenCalled()
  })


  it('calls unHideElementsById([]) when globalIds is an empty array', () => {
    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: []})
    expect(mockUnHideElementsById).toHaveBeenCalledWith([])
    expect(mockUnHideAllElements).not.toHaveBeenCalled()
  })


  it('translates globalIds into numeric expressIds via the searchIndex', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation((id) => ({
      'gid-a': '10',
      'gid-b': '20',
    })[id])

    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: ['gid-a', 'gid-b']})

    expect(mockUnHideElementsById).toHaveBeenCalledWith([10, 20])
  })


  it('drops unresolved globalIds', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation(
      (id) => (id === 'known' ? '3' : undefined),
    )

    const handler = new UnhideElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: ['known', 'missing']})

    expect(mockUnHideElementsById).toHaveBeenCalledWith([3])
  })
})
