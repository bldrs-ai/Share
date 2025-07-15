import {WidgetApi as MatrixWidgetApi} from 'matrix-widget-api/lib/WidgetApi'
import {MatrixCapabilities} from 'matrix-widget-api/lib/interfaces/Capabilities'
import debug from '../utils/debug'
import AbstractApiConnection from './ApiConnection'


/** ApiConnection to Iframed bldrs instance */
export default class ApiConnectionIframe extends AbstractApiConnection {
  widgetId = 'bldrs-share'
  matrixWidgetApi = null
  started = false

  /** constructor */
  constructor() {
    super()
    this.matrixWidgetApi = new MatrixWidgetApi(this.widgetId, {
      waitForIframeLoad: false, // ⬅ turn off the automatic path
    })
    this.matrixWidgetApi.requestCapabilities([MatrixCapabilities.AlwaysOnScreen])
  }

  /**
   * Handler on Matrix API callbacks
   *
   * @param {string} eventName
   * @param {Function} callable
   */
  on(eventName, callable) {
    debug().log('ApiConnectionIframe#on, eventName:', eventName)
    this.matrixWidgetApi.on(
        eventName,
        (event) => {
          event.preventDefault()
          const response = callable(event.detail.data)
          this.matrixWidgetApi.transport.reply(event.detail, response)
        },
    )
  }

  /**
   * Send event on Matrix API transport
   *
   * @param {string} eventName
   * @param {object} data
   */
  send(eventName, data) {
    debug().log('ApiConnectionIframe#send: eventName:', eventName)
    this.matrixWidgetApi.transport.send(eventName, data)
  }

  /**
   * Requests capabilities from other end of Matrix API transport
   *
   * @param {string[]} capabilities
   */
  requestCapabilities(capabilities) {
    debug().log('ApiConnectionIframe#send: requestCapabilities:', capabilities)
    this.matrixWidgetApi.requestCapabilities(capabilities)
  }

  /** Starts the Matrix API message transprot */
  start() {
    debug().log('ApiConnectionIframe#send: start & sendContentLoaded!')
    if (!this.started) {
      this.matrixWidgetApi.start()
      this.matrixWidgetApi.sendContentLoaded()
      this.started = true
    }
  }

  /** Stops the Matrix API message transport */
  stop() {
    this.matrixWidgetApi.stop()
    this.started = false
  }
}
