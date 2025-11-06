import {
  batchUpdateHash,
  getHashParams,
  getHashParamsFromUrl,
  setParamsToHash,
  stripHashParams,
  removeParamsFromHash as utilsRemoveParamsFromHash,
} from '../../utils/location'
import {findMarkdownUrls} from '../../utils/strings'
import {removeParamsFromHash as removeCameraParamsFromHash} from '../Camera/hashState'
import {
  removeCommentParamsFromHash,
  removeNotesParamsFromHash,
  setCommentParamsToHash,
  setNotesParamsToHash,
} from '../Notes/hashState'


export const HASH_PREFIX_PLACE_MARK = 'm'


/**
 * Retrieves the active placemark hash from the current location.
 *
 * Extracts the hash associated with a placemark (based on the defined hash prefix)
 * from the current window's location object.
 *
 * @return {string|null} The active placemark hash, or `null` if no hash is found.
 */
export function getActivePlaceMarkHash() {
  return getHashParams(location, HASH_PREFIX_PLACE_MARK)
}


/**
 * @param {string} hash - The URL hash
 * @param {string} _issueID - The issue ID
 * @param {string} _commentID - The comment ID
 * @return {string} The transformed URL
 */
export function modifyPlaceMarkHash(hash, _issueID, _commentID) {
  if (hash && _issueID) {
    let newHash = hash
    let newURL = null
    if (!hash.startsWith('#')) {
      newURL = new URL(hash)
      newHash = newURL.hash
    }

    if (newHash) {
      newHash = removeNotesParamsFromHash(newHash)
      newHash = removeCommentParamsFromHash(newHash)
      newHash = setNotesParamsToHash(newHash, {_issueID})

      if (_commentID) {
        newHash = setCommentParamsToHash(newHash, {_commentID})
      }
    }

    if (newURL) {
      newURL.hash = newHash
      return newURL.toString()
    }

    return newHash
  }

  return hash
}


/**
 * Parses placemark URLs from an issue body.
 *
 * Extracts URLs that contain the specified placemark hash prefix from a given issue body.
 *
 * @param {string} issueBody The body of the issue to parse for placemark URLs.
 * @return {string[]} An array of extracted placemark URLs.
 */
export function parsePlacemarkFromIssue(issueBody) {
  return findMarkdownUrls(issueBody, HASH_PREFIX_PLACE_MARK)
}


/**
 * Extracts the placemark hash from a given URL.
 *
 * Parses a URL to extract the hash segment associated with a placemark,
 * based on the defined hash prefix.
 *
 * @param {string} url The URL to parse for a placemark hash.
 * @return {string|null} The extracted placemark hash, or `null` if no hash is found.
 */
export function parsePlacemarkFromURL(url) {
  return getHashParamsFromUrl(url, HASH_PREFIX_PLACE_MARK)
}


/**
 * Removes placemark parameters from the URL.
 *
 * This function removes any URL hash parameters associated with placemarks
 * (identified by the placemark hash prefix) from the current browser window's location
 * or a specified location object.
 *
 * @param {Location|null} location The location object to modify. If null, uses `window.location`.
 * @return {string} The updated hash string with placemark parameters removed.
 */
export function removeMarkerUrlParams(location = null) {
  return stripHashParams(location ? location : window.location, HASH_PREFIX_PLACE_MARK)
}


/**
 * @param {string} hash
 * @return {string} hash with camera params removed
 */
export function removeParamsFromHash(hash) {
  return utilsRemoveParamsFromHash(hash, HASH_PREFIX_PLACE_MARK)
}


/**
 * @param {Array<string>} markArr
 */
export function saveMarkToHash(markArr) {
  batchUpdateHash(window.location, [
    (hash) => setParamsToHash(hash, HASH_PREFIX_PLACE_MARK, markArr),
    (hash) => removeCameraParamsFromHash(hash),
    (hash) => removeCommentParamsFromHash(hash),
    (hash) => removeNotesParamsFromHash(hash),
  ])
}
