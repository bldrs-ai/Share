/**
 * Abstract ApiEventHandler
 */
class ApiEventHandler {
  /**
   * The event name.
   */
  name = null

  /**
   * event handler.
   *
   * @param {object} data the event associated data
   */
  handle(data) {
  // do something on event.
  }
}

export default ApiEventHandler
