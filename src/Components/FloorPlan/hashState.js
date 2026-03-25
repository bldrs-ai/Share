// Hash utilities for floor plan state (fp:N)


/** The prefix to use for the FloorPlan state token */
export const HASH_PREFIX_FLOOR_PLAN = 'fp'


/**
 * Parse floor plan index from URL hash.
 *
 * @param {object} location react-router location
 * @return {number|null} floor index or null
 */
export function getFloorFromHash(location) {
  const hash = location?.hash || window.location.hash || ''
  const match = hash.match(new RegExp(`${HASH_PREFIX_FLOOR_PLAN}:(\\d+)`))
  if (match) {
    return parseInt(match[1], 10)
  }
  return null
}


/**
 * Add floor plan index to URL hash.
 * Produces: #...;fp:2
 *
 * @param {number} floorIndex
 */
export function addFloorToHash(floorIndex) {
  const hash = window.location.hash.substring(1)
  // Remove any existing fp: param
  const parts = hash.split(';').filter((p) => !p.startsWith(HASH_PREFIX_FLOOR_PLAN + ':'))
  parts.push(`${HASH_PREFIX_FLOOR_PLAN}:${floorIndex}`)
  window.location.hash = parts.filter(Boolean).join(';')
}


/**
 * Remove floor plan params from URL hash.
 */
export function removeFloorFromHash() {
  const hash = window.location.hash.substring(1)
  const parts = hash.split(';').filter((p) => !p.startsWith(HASH_PREFIX_FLOOR_PLAN + ':'))
  window.location.hash = parts.filter(Boolean).join(';') || ''
}
