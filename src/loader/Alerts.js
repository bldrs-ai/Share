import {Exception, Alert} from '../Alerts'


/**
 * Error when the cache is invalid.
 *
 * @param {string} message
 */
export class CacheException extends Exception {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'CacheException'
    this.title = message || 'Cache exception'
    this.description = `${message || 'Cached exception'}.  Please clear your cache and try again. ` +
      'See our [Troubleshooting](http://github.com/bldrs-ai/Share/wiki/Troubleshooting#cache-corruption) ' +
      'page for more information.\n' +
      '- Try: **Profile > Clear Local Cache**'
    this.action = 'Clear cache'
    this.actionUrl = '/' // hard reset the app
  }
}


/** For network or file resources that are not found. */
export class NotFoundAlert extends Alert {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'NotFoundAlert'
    this.title = 'File not found'
    this.description = 'The file you are trying to access does not exist.'
  }
}
