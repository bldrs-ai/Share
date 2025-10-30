/**
 * Extend JS Error.  All will be handled by AlertDialog.
 *
 * 0. throw new Error -> Hard reset (window.location.replace('/'))
 * 1. throw new Exception -> Hard reset by default, optional fix action, eg clear cache.
 * 2. throw new Alert -> Soft reset (navigate('/share/v/p/index.ifc'))
 * 3. setAlert(new Info) -> OK: snackbar notification
 * 4. setAlert(new Success) -> OK: dialog
 */


// Errors
/** Severity levels used by alert-like classes. */
export type Severity = 'error' | 'warning' | 'info' | 'success'

/**
 * Base serializable exception/alert with helpers for structured clone and reconstruction.
 */
export class BaseException extends Error {
  severity: Severity
  name: string
  title: string
  description: string
  action: string
  actionUrl: string
  /** Optional underlying error/cause */
  cause?: unknown

  /**
   * @param message Error message
   * @param opts Optional fields to override and/or include a cause
   */
  constructor(message: string, opts?: {
    title?: string,
    description?: string,
    action?: string,
    actionUrl?: string,
    cause?: unknown,
  }) {
    // Prefer native Error cause propagation when available
    super(message)
    this.severity = 'error'
    this.name = 'BaseException'
    this.title = opts?.title || 'Error'
    this.description = opts?.description || message
    this.action = opts?.action || 'Reset'
    this.actionUrl = opts?.actionUrl || '/'
    this.cause = opts?.cause
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseException)
    }
    // If a cause Error exists, append its stack for debugging context
    const causeAny = (this as unknown as {cause?: unknown}).cause
    if (causeAny && typeof causeAny === 'object' && 'stack' in (causeAny as Record<string, unknown>)) {
      const cstack = (causeAny as {stack?: unknown}).stack
      if (typeof cstack === 'string' && typeof this.stack === 'string') {
        this.stack = `${this.stack}\nCaused by: ${cstack}`
      }
    }
  }

  /**
   * Serialize to a plain JSON object suitable for postMessage.
   *
   * @return JSON object
   */
  toJson() {
    const causeAny = (this as unknown as {cause?: unknown}).cause
    const causeErr = causeAny instanceof Error ? causeAny : null
    return {
      type: this.constructor.name,
      message: this.message,
      severity: this.severity,
      name: this.name,
      title: this.title,
      description: this.description,
      action: this.action,
      actionUrl: this.actionUrl,
      stack: this.stack ?? null,
      causeMessage: causeErr ? causeErr.message : (causeAny ? String(causeAny) : null),
      causeStack: causeErr ? (causeErr.stack || null) : null,
    }
  }

  /**
   * Reconstruct an instance from JSON created by toJson().
   * Falls back to BaseException if type is unknown.
   *
   * @param json JSON object
   * @return BaseException instance
   */
  static fromJson(json: {
    type?: string,
    message?: string,
    severity?: Severity,
    name?: string,
    title?: string,
    description?: string,
    action?: string,
    actionUrl?: string,
    stack?: string | null,
    causeMessage?: string | null,
    causeStack?: string | null,
  }): BaseException {
    const {type, message, severity, name, title, description, action, actionUrl, stack, causeMessage, causeStack} = json || {}
    let instance: BaseException
    switch (type) {
      case 'Exception':
        instance = new Exception(message || title || 'Exception')
        break
      case 'Alert':
        instance = new Alert(message || title || 'Alert')
        break
      case 'Info':
        instance = new Info(name, title, description) as unknown as BaseException
        break
      case 'Success':
        instance = new Success(name, title, description) as unknown as BaseException
        break
      default:
        instance = new BaseException(message || title || 'Error')
        break
    }
    if (severity) {
      instance.severity = severity
    }
    if (name) {
      instance.name = name
    }
    if (title) {
      instance.title = title
    }
    if (description) {
      instance.description = description
    }
    if (action) {
      instance.action = action
    }
    if (actionUrl) {
      instance.actionUrl = actionUrl
    }
    if (stack) {
      instance.stack = stack
    }
    // Attach cause data (as message/stack) for debugging context
    if (causeMessage || causeStack) {
      const cause = new Error(causeMessage || 'cause')
      if (causeStack) {
        cause.stack = causeStack
      }
      instance.cause = cause
      if (typeof instance.stack === 'string' && cause.stack) {
        instance.stack = `${instance.stack}\nCaused by: ${cause.stack}`
      }
    }
    return instance
  }
}


/**
 * Error with a reset action for user.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Exception extends BaseException {
  /**
   * @param message Error message
   */
  constructor(message: string) {
    super(message)
    this.severity = 'error'
    this.name = 'Exception'
    this.title = 'Exception'
    this.description = 'An exception occurred.  Please reset the application and try again.'
    this.action = 'Reset'
    this.actionUrl = '/'
  }
}


// Alerts
/**
 * Alert with a reset action for user.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Alert extends BaseException {
  /**
   * @param message Error message
   */
  constructor(message: string) {
    super(message)
    this.severity = 'warning'
    this.name = 'Alert'
    this.title = 'Alert'
    this.description = 'An alert occurred.  Please check the application and try again.'
    this.action = 'Reset'
    this.actionUrl = '/share/v/p/index.ifc' // Soft reset by redirect to default model
  }
}


// Info
/**
 * Info message for user.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Info extends BaseException {
  /**
   * @param name
   * @param title
   * @param description
   */
  constructor(
    name = 'Info',
    title = 'Info',
    description = 'An info message occurred.  Please check the application and try again.',
  ) {
    super(description)
    this.severity = 'info'
    this.name = name
    this.title = title
    this.description = description
  }
}


// Success
/**
 * Success message.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Success extends BaseException {
  /**
   * @param name
   * @param title
   * @param description
   */
  constructor(
    name = 'Success',
    title = 'Success',
    description = 'A success message occurred.  Please check the application and try again.',
  ) {
    super(description)
    this.severity = 'success'
    this.name = name
    this.title = title
    this.description = description
  }
}


/**
 * Indicates streaming reads/writes are not supported in the current environment.
 * Used when Response.body is unavailable and streaming OPFS writes cannot be performed.
 *
 * @augments BaseException
 */
export class FileStreamingUnsupported extends BaseException {
  /**
   * @param message
   */
  constructor(message: string) {
    super(message)
    this.severity = 'error'
    this.name = 'FileStreamingUnsupported'
    this.title = 'Streaming not supported'
    this.description = message
  }
}
