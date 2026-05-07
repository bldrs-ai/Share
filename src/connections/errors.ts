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


/**
 * Thrown when a sharing-capability call is refused by the provider for
 * authorization reasons — the connection is healthy, but the acting user
 * cannot perform the operation on this resource (e.g. listing collaborators
 * on a repo they don't admin, or sharing a Drive file they don't own).
 *
 * Distinct from `NeedsReconnectError`: there's nothing to reconnect, the
 * user simply lacks the privilege. UI should surface this as "you don't
 * have permission" rather than as a sign-in prompt.
 */
export class InsufficientPermissionError extends Error {
  readonly connection: Connection
  readonly cause?: string

  /**
   * @param connection The connection that was acting on the resource
   * @param cause Short machine-readable tag, e.g. 'forbidden'
   * @param message Human-readable message for logs/dialogs
   */
  constructor(connection: Connection, cause?: string, message?: string) {
    super(message ?? `Insufficient permission for ${connection.label}`)
    this.name = 'InsufficientPermissionError'
    this.connection = connection
    this.cause = cause
    Object.setPrototypeOf(this, InsufficientPermissionError.prototype)
  }
}


/**
 * Thrown for any non-auth, non-permission failure during a sharing-capability
 * call: 4xx that isn't 401/403, 5xx, network failure, malformed response,
 * or a request the adapter refused outright (e.g. a `ResourceRef` shape the
 * adapter doesn't own).
 *
 * The `cause` field carries a short machine-readable tag so callers and
 * dialogs can branch without parsing `message`.
 */
export class GrantFailedError extends Error {
  readonly connection: Connection
  readonly cause?: string

  /**
   * @param connection The connection that was acting on the resource
   * @param cause Short machine-readable tag, e.g. 'http_500' or 'wrong_provider'
   * @param message Human-readable message for logs/dialogs
   */
  constructor(connection: Connection, cause?: string, message?: string) {
    super(message ?? `Sharing operation failed on ${connection.label}`)
    this.name = 'GrantFailedError'
    this.connection = connection
    this.cause = cause
    Object.setPrototypeOf(this, GrantFailedError.prototype)
  }
}
