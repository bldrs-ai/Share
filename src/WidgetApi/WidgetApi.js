import ApiConnectionIframe from './ApiConnectionIframe'
import ApiEventsRegistry from './ApiEventsRegistry'


/**
 * WidgetApi main class
 */
class WidgetApi {
  /**
   * constructor
   */
  constructor(navigation) {
    if (this.detectIframe()) {
      const apiConnection = new ApiConnectionIframe()
      new ApiEventsRegistry(apiConnection, navigation)
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
