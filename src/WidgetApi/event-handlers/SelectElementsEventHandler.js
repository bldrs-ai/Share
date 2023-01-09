import useStore from '../../store/useStore'
import ApiEventHandler from './ApiEventHandler'
/**
 * Select Elements API event handler
 */
class SelectElementsEventHandler extends ApiEventHandler {
  apiConnection = null
  name = 'ai.bldrs-share.SelectElements'


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

    useStore.setState({selectedElements: expressIds})

    return this.apiConnection.successfulResponse({})
  }
}

export default SelectElementsEventHandler
