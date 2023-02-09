import useStore from '../../store/useStore'
import ApiEventHandler from './ApiEventHandler'

/**
 * Select Elements API event
 */
class UIComponentsVisibilityEventHandler extends ApiEventHandler {
  apiConnection = null
  name = 'ai.bldrs-share.UIComponentsVisibility'

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
   * {
   *   searchBar: bool,
   *   navigationPanel: bool,
   *   collaboration: bool,
   *   modelInteraction : bool,
   *   settings: bool,
   * }
   * @return {object} the response of the API call
   */
  handler(data) {
    if (('searchBar' in data)) {
      useStore.getState().setIsSearchbarVisibile(data.searchBar)
    }
    if (('navigationPanel' in data)) {
      useStore.getState().setIsNavigationPanelVisibile(data.navigationPanel)
    }
    if (('collaboration' in data)) {
      useStore.getState().setIsCollaborationGroupVisibile(data.collaboration)
    }
    if (('modelInteraction' in data)) {
      useStore.getState().setIsModelInteractionGroupVisibile(data.modelInteraction)
    }
    if (('settings' in data)) {
      useStore.getState().setIsSettingsVisibile(data.settings)
    }
    return this.apiConnection.successfulResponse({})
  }
}

export default UIComponentsVisibilityEventHandler
