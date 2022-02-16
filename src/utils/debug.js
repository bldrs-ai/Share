let MAX_LEVEL = 4
let MIN_LEVEL = 0
let DEBUG_LEVEL = MAX_LEVEL


/**
 * When debuggin is turned off, use this mock log object to throw
 * away log messages.
 */
const mockLog = {
  log: () => {},
  warn: () => {},
  time: () => {},
  timeEnd: () => {}
}


export default function debug(level = MIN_LEVEL) {
  return level < DEBUG_LEVEL ? console : mockLog
}


export function setDebugLevel(level) {
  if (!Number.isFinite(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new Error(`Debug level must be a number from 0-${MAX_LEVEL}`)
  }
  DEBUG_LEVEL = level
}


export function disableDebug() {
  setDebugLevel(MIN_LEVEL)
}
