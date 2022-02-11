const DEBUG_LEVEL = 4
/**
 * Create debug statement.
 * @param {string} level
 * @return {function}
 */
export default function debug(level = 0) {
  return level < DEBUG_LEVEL ? console : {log: () => {}}
}
