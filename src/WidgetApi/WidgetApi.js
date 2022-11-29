import ApiConnectionIframe from './ApiConnectionIframe'
import ApiEventsRegistry from './ApiEventsRegistry'


/**
 * WidgetApi main class
 */
export default class WidgetApi {
  /**
   * constructor
   *
   * @param {object} navigation NavigationFunction
   * @param {object} searchIndex SearchIndex
   */
  constructor(navigation, searchIndex) {
    if (this.detectIframe()) {
      const apiConnection = new ApiConnectionIframe()
      new ApiEventsRegistry(apiConnection, navigation, searchIndex)
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
