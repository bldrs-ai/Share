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
   *   branchesControl: bool,
   *   navPanel: bool,
   *   shareButton: bool,
   *   notes: bool,
   *   properties: bool,
   *   cutPlaneMenu: bool,
   *   isolateLevelsMenu: bool,
   *   clearButton: bool,
   *   themeButton: bool,
   *   aboutButton: bool,
   * }
   * @return {object} the response of the API call
   */
  handler(data) {
    if (('searchBar' in data)) {
      useStore.getState().setSearchbarVisibility(data.searchBar)
    }
    if (('branchesControl' in data)) {
      useStore.getState().setBranchesControlVisibility(data.branchesControl)
    }
    if (('navPanel' in data)) {
      useStore.getState().setNavPanelVisibility(data.navPanel)
    }
    if (('shareButton' in data)) {
      useStore.getState().setShareControlVisibility(data.shareButton)
    }
    if (('notes' in data)) {
      useStore.getState().setNotesVisibility(data.notes)
    }
    if (('properties' in data)) {
      useStore.getState().setPropertiesVisibility(data.properties)
    }
    if (('cutPlaneMenu' in data)) {
      useStore.getState().setCutPlaneMenuVisibility(data.cutPlaneMenu)
    }
    if (('isolateLevelsMenu' in data)) {
      useStore.getState().setExtractLevelsMenuVisibility(data.isolateLevelsMenu)
    }
    if (('clearButton' in data)) {
      useStore.getState().setClearButtonVisibility(data.clearButton)
    }
    if (('themeButton' in data)) {
      useStore.getState().setThemeButtonVisibility(data.themeButton)
    }
    if (('aboutButton' in data)) {
      useStore.getState().setAboutControlVisibility(data.aboutButton)
    }
    return this.apiConnection.successfulResponse({})
  }
}

export default UIComponentsVisibilityEventHandler
