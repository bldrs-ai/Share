import ApiConnectionIframe from './ApiConnectionIframe'
import ApiEventsRegistry from './ApiEventsRegistry'
import debug from '../utils/debug'


/** WidgetApi main class */
export default class WidgetApi {
  /**
   * constructor
   *
   * @param {object} navigation NavigationFunction
   * @param {object} searchIndex SearchIndex
   */
  constructor(navigation, searchIndex) {
    debug().log('WidgetApi#ctor')
    if (this.detectIframe()) {
      const apiConnection = new ApiConnectionIframe()
      new ApiEventsRegistry(apiConnection, navigation, searchIndex)
    }
  }

  /** @return {boolean} if code is executed in an iframe or not */
  detectIframe() {
    // if this document is hosted in an iframe and has the *same origin*
    // as the parent document then window.frameElement is to be checked.
    try {
      if (window.frameElement) {
        return true
      }
    } catch (e) {
      // ignore
    }

    // if this document is not hosted in an iframe or is hosted in an
    // iframe that has a *different origin* than the parent document then
    // window.top should be checked.
    try {
      return window.self !== window.top
    } catch (e) {
      return true
    }
  }
}
