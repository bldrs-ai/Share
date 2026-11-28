export const HOMEPAGE_VERSIONS_DIRECTORY = 'homepage-versions'
const REVISION_PATH = /^homepage-versions\/([0-9a-f]{40})\/index\.ifc$/


/**
 * Match the shipped home model family, including pinned revisions under /v/p.
 *
 * @param {?object} modelPath Parsed viewer route
 * @return {boolean}
 */
export function isHomepageModel(modelPath) {
  return modelPath?.kind === 'file' && !modelPath.isUploadedFile &&
    (modelPath.filepath === 'index.ifc' || REVISION_PATH.test(modelPath.filepath))
}


/**
 * Find the active commit in a pinned home model path.
 *
 * @param {string} filepath Parsed file path
 * @return {string|undefined}
 */
export function homepageRevision(filepath) {
  return REVISION_PATH.exec(filepath)?.[1]
}
