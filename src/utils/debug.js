const VERBOSE = 3
// eslint-disable-next-line no-unused-vars
const DEBUG = 2
const INFO = 1
const OFF = 0
let DEBUG_LEVEL = 0


/**
 * Create debug statement.
 *
 * @param {number} level Default is INFO.
 * @return {Function} returned function is console.log or a no-op if debugging is turned off
 */
export default function debug(level = INFO) {
  return level <= DEBUG_LEVEL ? console : mockLog
}


/**
 * @param {number} level One of OFF, INFO, DEBUG, VERBOSE.
 */
export function setDebugLevel(level) {
  if (!Number.isFinite(level) || level < OFF || level > VERBOSE) {
    throw new Error(`Debug level must be a number from 0-${VERBOSE}`)
  }
  DEBUG_LEVEL = level
}


/** Equivalent to setDebugLevel(OFF) */
export function disableDebug() {
  setDebugLevel(OFF)
}


/**
 * When debugging is turned off, use this mock log object to throw
 * away log messages.
 */
const mockLog = {
  /* eslint-disable no-empty-function */
  log: () => {},
  warn: () => {},
  time: () => {},
  timeEnd: () => {},
}
