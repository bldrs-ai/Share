import ApiEventDispatcher from './ApiEventDispatcher'
import useStore from '../../store/useStore'

/**
 * class ModelLoadedEventDispatcher
 */
class ModelLoadedEventDispatcher extends ApiEventDispatcher {
  name = 'ai.bldrs-share.ModelLoaded'
  apiConnection = null

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
   * initialize dispatcher.
   *
   */
  initDispatch() {
    useStore.subscribe((state, previousState) => {
      if (state.modelStore !== previousState.modelStore) {
        const eventData = {}
        this.apiConnection.send(this.name, eventData)
      }
    })
  }
}

export default ModelLoadedEventDispatcher
