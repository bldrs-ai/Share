import ApiConnectionIframe from './ApiConnectionIframe'
import ApiEventsRegistry from './ApiEventsRegistry'


/**
 * WidgetApi main class
 */
class WidgetApi {
  /**
   * constructor
   */
  constructor() {
    if (this.detectIframe()) {
      const apiConnection = new ApiConnectionIframe()
      new ApiEventsRegistry(apiConnection)
      apiConnection.start()
    }
  }

  /**
   * returns if code is executed in an iframe or not
   *
   * @return {boolean}
   */
  detectIframe() {
    try {
      return window.self !== window.top
    } catch (e) {
      return true
    }
  }
}

export default WidgetApi
