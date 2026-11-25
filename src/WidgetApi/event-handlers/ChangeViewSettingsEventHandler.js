import ApiEventHandler from './ApiEventHandler'

/**
 * Change View Settings API event handler. Kept so an embedder that sends it
 * still gets a success: the `?view=` rules stack it fed styled nothing on
 * either engine and was deleted (design/tracks/open-t200/layering.md §7,
 * slice V), so the settings are accepted and not applied, and the model is
 * no longer reloaded for them.
 */
class ChangeViewSettingsEventHandler extends ApiEventHandler {
  apiConnection = null
  name = 'ai.bldrs-share.ChangeViewSettings'

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
   * @param {object} data the event associated data
   * @return {object} the response of the API call
   */
  handler(data) {
    if (!('customViewSettings' in data)) {
      return this.apiConnection.missingArgumentResponse('customViewSettings')
    }
    return this.apiConnection.successfulResponse({})
  }
}

export default ChangeViewSettingsEventHandler
