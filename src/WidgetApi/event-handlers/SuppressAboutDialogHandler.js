import ApiEventHandler from './ApiEventHandler'
import useStore from '../../store/useStore'

/**
 * Select Elements API event handler
 */
class SuppressAboutDialogHandler extends ApiEventHandler {
  apiConnection = null
  navigation = null
  name = 'ai.bldrs-share.SuppressAboutDialog'

  /**
   * constructor
   *
   * @param {object} apiConnection AbstractApiConnection
   */
  constructor(apiConnection) {
    super()
    this.apiConnection = apiConnection
  }

  /**
   * The handler for this event
   *
   * @param {data} data the event associated data
   * @return {object} the response of the API call
   */
  handler(data) {
    if (!('isSuppressed' in data)) {
      return this.apiConnection.missingArgumentResponse('isSuppressed')
    }
    useStore.getState().setIsAboutDialogSuppressed(data.isSuppressed)
    return this.apiConnection.successfulResponse({})
  }
}

export default SuppressAboutDialogHandler
