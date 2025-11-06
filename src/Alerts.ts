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
 * Base serializable error with helpers for structured clone and reconstruction.
 */
export class BaseError extends Error {
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
  constructor(
    message: string,
    opts?: {
      title?: string,
      description?: string,
      action?: string,
      actionUrl?: string,
      cause?: unknown,
      severity?: Severity,
  }) {
    // Pass cause to super so native chaining works
    // (OK in Node 16.9+/Chromium 93+; harmless elsewhere)
    if (opts?.cause !== undefined) {
      // @ts-expect-error - Error constructor with options.cause is supported in Node 16.9+/Chromium 93+
      super(message, {cause: opts.cause})
    } else {
      super(message)
    }
    this.severity = 'error'
    this.name = new.target.name
    this.title = opts?.title || 'FooError'
    this.description = opts?.description || message
    this.action = opts?.action || 'Reset'
    this.actionUrl = opts?.actionUrl || '/'
    this.cause = opts?.cause
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseError)
    }
  }

  /**
   * Serialize the error to a JSON object.
   *
   * @return The JSON object.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      title: this.title,
      description: this.description,
      action: this.action,
      actionUrl: this.actionUrl,
      severity: this.severity,
      cause: this.cause instanceof Error ? {name: this.cause.name, message: String(this.cause.message)} : this.cause,
      stack: this.stack,
    }
  }


  /**
   * Reconstruct an error from a JSON object.
   *
   * @param obj - The JSON object to reconstruct the error from.
   * @return The reconstructed error.
   */
  static fromJSON(obj: Record<string, unknown>): BaseError {
    const err = new BaseError(String(obj?.message ?? 'Error'), {
      title: typeof obj?.title === 'string' ? obj.title : undefined,
      description: typeof obj?.description === 'string' ? obj.description : undefined,
      action: typeof obj?.action === 'string' ? obj.action : undefined,
      actionUrl: typeof obj?.actionUrl === 'string' ? obj.actionUrl : undefined,
      cause: obj?.cause,
      severity: obj?.severity as Severity | undefined,
    })
    err.name = String(obj?.name ?? 'BaseError')
    err.stack = typeof obj?.stack === 'string' ? obj.stack : err.stack
    return err
  }
}


/**
 * Error with a reset action for user.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Exception extends BaseError {
  /**
   * @param message Error message
   */
  constructor(
    message = 'Exception occurred. Please reset the application and try again.',
    opts: { cause?: unknown } = {},
  ) {
    super(message, {
      severity: 'error',
      title: 'Exception',
      description: 'An exception occurred.  Please reset the application and try again.',
      action: 'Reset',
      actionUrl: '/',
      cause: opts?.cause,
    })
  }
}


// Alerts
/**
 * Alert message for user.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Alert {
  name: string
  message: string
  severity: 'alert'
  title: string
  description: string
  action: string
  actionUrl: string

  /**
   * @param message Error message
   * @param opts Optional fields to override and/or include a cause
   */
  constructor(
    message = 'Alert message occurred. Please check the application and try again.',
    opts: {
      title?: string,
      description?: string,
      action?: string,
      actionUrl?: string,
      cause?: unknown,
    } = {
      title: 'Alert',
      description: message,
      action: 'Reset',
      actionUrl: '/share/v/p/index.ifc',
    },
  ) {
    this.name = new.target.name
    this.message = message
    this.severity = 'alert'
    this.title = opts.title ?? 'Alert'
    this.description = opts.description ?? message
    this.action = opts.action ?? 'Reset'
    this.actionUrl = opts.actionUrl ?? '/share/v/p/index.ifc'
  }
}


// Info
/**
 * Info message for user.
 *
 * NB: Subclass this class to provide a custom title, description, and action.
 */
export class Info {
  name: string
  message: string
  severity: 'info'
  title: string
  description: string
  action: string
  actionUrl: string
  cause?: unknown

  /**
   * @param message Error message
   * @param opts Optional fields to override and/or include a cause
   */
  constructor(
    message = 'Info message occurred. Please check the application and try again.',
    opts: {
      title?: string,
      description?: string,
      action?: string,
      actionUrl?: string,
      cause?: unknown,
    } = {
      title: 'Info',
      description: message,
      action: 'Reset',
      actionUrl: '/',
    },
  ) {
    this.name = new.target.name
    this.message = message
    this.severity = 'info'
    this.title = opts.title ?? 'Info'
    this.description = opts.description ?? message
    this.action = opts.action ?? 'Reset'
    this.actionUrl = opts.actionUrl ?? '/'
  }
}


/** SpecificErrors */

/**
 * Error when the application runs out of memory.
 *
 * @augments BaseError
 */
export class OutOfMemoryError extends BaseError {
  /** @param message Error message */
  constructor(
    message = 'The application ran out of memory.  Please reset the application and try again.',
    opts: { cause?: unknown } = {},
  ) {
    super(message, {
      severity: 'error',
      title: 'Out of Memory',
      description: message,
      cause: opts?.cause,
    })
  }
}


/**
 * Indicates streaming reads/writes are not supported in the current environment.
 * Used when Response.body is unavailable and streaming OPFS writes cannot be performed.
 *
 * @augments BaseError
 */
export class FileStreamingUnsupported extends BaseError {
  /**
   * @param message Error message
   */
  constructor(
    message = 'Streaming not supported. Please reset the application and try again.',
    opts: { cause?: unknown } = {},
  ) {
    super(message, {
      severity: 'error',
      title: 'Streaming not supported',
      description: message,
      cause: opts?.cause,
    })
  }
}
