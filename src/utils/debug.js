const DEBUG_LEVEL = 4
/**
* Create debug statement.
* @param {string} level
* @return {function} returned function is console.log or a no-op if debugging is turned off
*/
export default function debug(level = 0) {
  return level < DEBUG_LEVEL ? console : {log: () => {}}
}
