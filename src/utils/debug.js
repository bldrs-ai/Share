const MAX_LEVEL = 4
const MIN_LEVEL = 0
let DEBUG_LEVEL = MAX_LEVEL


/**
 * Create debug statement.
 * @param {Number} level
 * @return {function} returned function is console.log or a no-op if debugging is turned off
 */
export default function debug(level = MIN_LEVEL) {
  return level < DEBUG_LEVEL ? console : mockLog
}


/**
 * @param {Number} level From MIN_LEVEL to MAX_LEVEL.
 */
export function setDebugLevel(level) {
  if (!Number.isFinite(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new Error(`Debug level must be a number from 0-${MAX_LEVEL}`)
  }
  DEBUG_LEVEL = level
}

/** Equivalent to setDebugLevel(MIN_LEVEL) */
export function disableDebug() {
  setDebugLevel(MIN_LEVEL)
}


/**
 * When debugging is turned off, use this mock log object to throw
 * away log messages.
 */
const mockLog = {
  log: () => {},
  warn: () => {},
  time: () => {},
  timeEnd: () => {},
}
