import useStore from '../../store/useStore'
import ApiEventHandler from './ApiEventHandler'
/**
 * Hide Elements API event handler
 */
class HideElementsEventHandler extends ApiEventHandler {
  apiConnection = null
  name = 'ai.bldrs-share.HideElements'


  /**
   * constructor
   *
   * @param {object} apiConnection AbstractApiConnection
   * @param {object} searchIndex SearchIndex
   */
  constructor(apiConnection, searchIndex) {
    super()
    this.apiConnection = apiConnection
    this.searchIndex = searchIndex
  }

  /**
   * The handler for this event
   *
   * @param {object} data the event associated data
   * @return {object} the response of the API call
   */
  handler(data) {
    if (!('globalIds' in data)) {
      return this.apiConnection.missingArgumentResponse('globalIds')
    }

    if (data.globalIds === null) {
      return this.apiConnection.invalidOperationResponse('globalIds can\'t be null')
    }

    const expressIds = []

    if (data.globalIds.length) {
      for (const globalId of data.globalIds) {
        const expressId = this.searchIndex.getExpressIdByGlobalId(globalId)
        if (expressId) {
          expressIds.push(expressId)
        }
      }
    }

    useStore.getState().viewerStore.isolator.hideElementsById(expressIds.map((id) => Number(id)))

    return this.apiConnection.successfulResponse({})
  }
}

export default HideElementsEventHandler
