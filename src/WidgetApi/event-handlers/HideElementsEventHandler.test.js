/* eslint-disable no-magic-numbers */
// Characterization tests for HideElementsEventHandler. The WidgetApi is
// lightly used and scheduled for refactoring — these pin current behavior
// so the refactor has an explicit baseline. Do not treat any assertion
// here as a desired invariant unless also documented in design docs.

import AbstractApiConnection from '../ApiConnection'
import HideElementsEventHandler from './HideElementsEventHandler'


const mockHideElementsById = jest.fn()

jest.mock('../../store/useStore', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      viewer: {
        isolator: {
          hideElementsById: mockHideElementsById,
        },
      },
    })),
  },
}))


describe('WidgetApi/event-handlers/HideElementsEventHandler', () => {
  let apiConnection
  let searchIndex

  beforeEach(() => {
    mockHideElementsById.mockClear()
    apiConnection = new AbstractApiConnection()
    searchIndex = {getExpressIdByGlobalId: jest.fn()}
  })


  it('exposes the canonical event name', () => {
    const handler = new HideElementsEventHandler(apiConnection, searchIndex)
    expect(handler.name).toBe('ai.bldrs-share.HideElements')
  })


  it('returns missing-argument when globalIds is absent', () => {
    const handler = new HideElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({})
    expect(result).toEqual({error: true, reason: 'Missing argument globalIds'})
    expect(mockHideElementsById).not.toHaveBeenCalled()
  })


  it('returns invalid-operation when globalIds is null', () => {
    const handler = new HideElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: null})
    expect(result).toEqual({error: true, reason: 'globalIds can\'t be null'})
    expect(mockHideElementsById).not.toHaveBeenCalled()
  })


  it('calls viewer.isolator.hideElementsById with an empty array when globalIds is empty', () => {
    const handler = new HideElementsEventHandler(apiConnection, searchIndex)
    const result = handler.handler({globalIds: []})

    expect(result).toEqual({error: false})
    expect(mockHideElementsById).toHaveBeenCalledWith([])
  })


  it('translates globalIds into numeric expressIds via the searchIndex', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation((id) => ({
      'gid-a': '10',
      'gid-b': '20',
    })[id])

    const handler = new HideElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: ['gid-a', 'gid-b']})

    expect(mockHideElementsById).toHaveBeenCalledWith([10, 20])
  })


  it('drops globalIds that the searchIndex does not resolve', () => {
    searchIndex.getExpressIdByGlobalId.mockImplementation(
      (id) => (id === 'known' ? '7' : undefined),
    )

    const handler = new HideElementsEventHandler(apiConnection, searchIndex)
    handler.handler({globalIds: ['known', 'missing']})

    expect(mockHideElementsById).toHaveBeenCalledWith([7])
  })
})
