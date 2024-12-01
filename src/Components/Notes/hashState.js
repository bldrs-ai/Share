import {
  hasParams,
  removeParams,
  removeParamsFromHash,
  setParams,
  setParamsToHash,
  batchUpdateHash,
} from '../../utils/location'
import {removeParamsFromHash as removeMarkerParamsFromHash} from '../Markers/hashState'


/** The prefix to use for the Note state tokens */
export const HASH_PREFIX_NOTES = 'i'
export const HASH_PREFIX_COMMENT = 'ic'


/** @return {boolean} */
export function isVisibleInitially() {
  return hasParams(HASH_PREFIX_NOTES)
}


/** Removes hash params for notes and comment */
export function removeHashParams() {
  removeParams(HASH_PREFIX_NOTES)
  removeParams(HASH_PREFIX_COMMENT)
}


/**
 * @param {string} hash
 * @return {string} hash with camera params removed
 */
export function removeCommentParamsFromHash(hash) {
  return removeParamsFromHash(hash, HASH_PREFIX_COMMENT)
}


/**
 * @param {string} hash
 * @return {string} hash with camera params removed
 */
export function removeNotesParamsFromHash(hash) {
  return removeParamsFromHash(hash, HASH_PREFIX_NOTES)
}


/** @param {object} params */
export function setHashParams(params) {
  setParams(HASH_PREFIX_NOTES, params)
}


/**
 * @param {string} hash
 * @param {object} params
 * @return {string} hash with comments params added
 */
export function setCommentParamsToHash(hash, params) {
  return setParamsToHash(hash, HASH_PREFIX_COMMENT, params)
}


/**
 * @param {string} hash
 * @param {object} params
 * @return {string} hash with notes params added
 */
export function setNotesParamsToHash(hash, params) {
  return setParamsToHash(hash, HASH_PREFIX_NOTES, params)
}


/** */
export function navBackToIssue() {
  const _location = window.location
  batchUpdateHash(_location, [
    (hash) => removeMarkerParamsFromHash(hash),
    (hash) => removeNotesParamsFromHash(hash),
    (hash) => removeCommentParamsFromHash(hash),
    (hash) => setParamsToHash(hash, HASH_PREFIX_NOTES),
  ])
}
