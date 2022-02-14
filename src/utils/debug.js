let DEBUG_LEVEL = 4


export default function debug(level = 0) {
  return level < DEBUG_LEVEL ? console : {log: () => {}}
}


export function setDebugLevel(level) {
  if (!Number.isFinite(level) || level < 0 || level > 4) {
    throw new Error('Debug level must be a number from 0-4')
  }
  DEBUG_LEVEL = level
}
