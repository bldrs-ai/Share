/**
 * Abstract ApiConnection
 */
class AbstractApiConnection {
  /**
   * event resolver.
   *
   * @param {string} eventName
   * @param {Function} callable
   */
  on(eventName, callable) {
    // do something on event.
  }

  /**
   * starts the api.
   */
  start() {
    console.warn('start() is not implemented')
  }

  /**
   * stops the api.
   */
  stop() {
    console.warn('stop() is not implemented')
  }

  /**
   * send event.
   *
   * @param {string} eventName
   * @param {object} data
   */
  send(eventName, data) {
    console.warn('send() is not implemented')
  }

  /**
   * requests capabilities.
   *
   * @param {string[]} capabilities
   */
  requestCapabilities(capabilities) {
    console.warn('requestCapabilities() is not implemented')
  }

  /**
   * returns a missing argument response.
   *
   * @param {string} argumentName
   * @return {object} missing argument response.
   */
  missingArgumentResponse = function(argumentName) {
    return {
      error: true,
      reason: `Missing argument ${argumentName}`,
    }
  }

  /**
   * returns a successful response.
   *
   * @param {object} data
   * @return {object} successful response.
   */
  successfulResponse = function(data) {
    return {
      error: false,
      ...data,
    }
  }
}

export default AbstractApiConnection
