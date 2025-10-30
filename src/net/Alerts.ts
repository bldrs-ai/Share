import {Exception, Alert} from '../Alerts'


/**
 * Simple network exception for major network problems that
 *  the app should try to recover from.
 */
export class NetworkException extends Exception {
  /** @param message Error message */
  constructor(message: string) {
    super(message)
    this.name = 'NetworkException'
    this.title = 'Network exception'
    this.description = 'A problem with the network resource occurred.'
  }
}


/**
 * Simple HTTP alert for HTTP errors that the app may want to
 * display to the user.
 */
export class HttpAlert extends Alert {
  /** @param message Error message */
  constructor(message: string) {
    super(message)
    this.name = 'HttpAlert'
    this.title = 'HTTP alert'
    this.description = 'A problem with the web occurred.'
  }
}
