import IfcCustomViewSettings from '../../Infrastructure/IfcCustomViewSettings'
import useStore from '../../store/useStore'
import ApiEventHandler from './ApiEventHandler'

/**
 * Select Elements API event handler
 */
class ChangeViewSettingsEventHandler extends ApiEventHandler {
  apiConnection = null
  name = 'ai.bldrs-share.ChangeViewSettings'

  /**
   * constructor
   *
   * @param {object} apiConnection AbstractApiConnection
   */
  constructor(apiConnection, navigation) {
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
    const customViewSettings = data.customViewSettings
    const customViewSettingsObject = new IfcCustomViewSettings(
      customViewSettings.defaultColor,
      customViewSettings.expressIdsToColorMap,
      customViewSettings.globalIdsToColorMap,
    )
    useStore.setState({customViewSettings: customViewSettingsObject})
    return this.apiConnection.successfulResponse({})
  }
}

export default ChangeViewSettingsEventHandler
