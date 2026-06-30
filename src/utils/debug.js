// Log levels, exported so callers can pick a threshold for `debug(level)`
// (e.g. `debug(DEBUG).log(...)` only surfaces under verbose logging).
export const OFF = 4
export const ERROR = 3
export const WARN = 2 // Use this as default for prod.  Should never see these messages.
export const INFO = 1
export const DEBUG = 0
let DEBUG_LEVEL = WARN


/**
 * Create debug statement.
 *
 * @param {number|boolean} level Default is INFO.
 * @return {console|MockLog} returned function is console.log or a no-op if debugging is turned off
 */
export default function debug(level = INFO) {
  return (level === true || (typeof level === 'number' && level >= DEBUG_LEVEL)) ? console : mockLog
}


/** @param {number} level One of OFF, INFO, DEBUG, ALL. */
export function setDebugLevel(level) {
  if (!Number.isFinite(level) || level < DEBUG || level > OFF) {
    throw new Error(`Debug level must be a number from ${DEBUG}-${OFF}`)
  }
  DEBUG_LEVEL = level
}


/** Equivalent to setDebugLevel(OFF) */
export function disableDebug() {
  setDebugLevel(OFF)
}


/**
 * Mock log object type definition.
 *
 * @typedef {object} MockLog
 * @property {Function} log - Mimics console.log
 * @property {Function} warn - Mimics console.warn
 * @property {Function} error - Mimics console.error
 * @property {Function} time - Mimics console.time
 * @property {Function} timeEnd - Mimics console.timeEnd
 */


/**
 * When debugging is turned off, use this mock log object to throw
 * away log messages.
 *
 * @type {MockLog}
 */
const mockLog = {
  /* eslint-disable no-empty-function */
  log: () => {},
  warn: () => {},
  error: () => {},
  time: () => {},
  timeEnd: () => {},
}
