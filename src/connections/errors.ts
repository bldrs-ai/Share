import type {Connection} from './types'


/**
 * Thrown when a connection's access token cannot be silently refreshed and
 * the provider's interactive consent flow could not be completed without
 * direct user attention. Typical causes: GIS popup blocked by the browser
 * because the call wasn't inside a user gesture, or the user dismissed the
 * consent popup.
 *
 * Carrying the offending Connection lets the UI route the user to a
 * Reconnect affordance bound to that specific connection, where a
 * subsequent click is a fresh user gesture and the popup is allowed.
 */
export class NeedsReconnectError extends Error {
  readonly connection: Connection
  readonly cause?: string

  /**
   * @param connection The connection that needs reconnecting
   * @param cause Underlying GIS error type (e.g. 'popup_failed_to_open')
   * @param message Human-readable message for logs/dialogs
   */
  constructor(connection: Connection, cause?: string, message?: string) {
    super(message ?? `Reconnect required for ${connection.label}`)
    this.name = 'NeedsReconnectError'
    this.connection = connection
    this.cause = cause
    // Preserve correct prototype chain through transpilation (TS quirk).
    Object.setPrototypeOf(this, NeedsReconnectError.prototype)
  }
}
