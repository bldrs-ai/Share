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
    throw new Error('start() is not implemented')
  }

  /**
   * stops the api.
   */
  stop() {
    throw new Error('stop() is not implemented')
  }

  /**
   * send event.
   *
   * @param {string} eventName
   * @param {object} data
   */
  send(eventName, data) {
    throw new Error('send() is not implemented')
  }

  /**
   * requests capabilities.
   *
   * @param {string[]} capabilities
   */
  requestCapabilities(capabilities) {
    throw new Error('requestCapabilities() is not implemented')
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
   * returns an invalid operation response.
   *
   * @param {string} message
   * @return {object} invalid operation response.
   */
  invalidOperationResponse = function(message) {
    return {
      error: true,
      reason: message,
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
