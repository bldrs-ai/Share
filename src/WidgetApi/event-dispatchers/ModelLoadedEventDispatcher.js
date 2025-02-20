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
      if (state.model !== previousState.model) {
        const eventData = { srcPath: this.getSrcPath() }
        this.apiConnection.send(this.name, eventData)
      }
    })
  }

  getSrcPath() {
    let modelUrl = null;
    const modelUrlIndex = 2;
    const urlParts = window.location.href.split('/');
    if(urlParts.length > modelUrlIndex) {
      const modelUrlBase64 = urlParts[urlParts.length - modelUrlIndex];
      modelUrl = atob(modelUrlBase64);  
    }
    return modelUrl;
  }
} 

export default ModelLoadedEventDispatcher
