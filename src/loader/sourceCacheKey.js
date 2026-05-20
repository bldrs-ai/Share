// Per-source-kind adapters that produce the input to glbCacheKey().
//
// The goal is for the cached GLB artifact to live in the SAME OPFS
// directory as its source IFC, so each model shows up as an IFC + GLB
// pair in OPFS Explorer. That means our (ns1, ns2, ns3) tuple must match
// exactly the (owner, repo, branch) tuple the source-file writer
// (downloadToOPFS / writeBase64Model / getModelFromOPFS) used.
//
// Source-file OPFS locations (from src/loader/Loader.js):
// - GitHub:    (owner, repo, branch)              from parseGitHubPath
// - Local:     ('BldrsLocalStorage', 'V1', 'Projects')   from downloadToOPFS
// - Upload:    ('BldrsLocalStorage', 'V1', 'Projects')   from getModelFromOPFS
// - External:  ('BldrsLocalStorage', 'V1', 'Projects')   from downloadToOPFS
//   (the host is encoded into the commitHash slot, not the dir path; the
//    content sha we compute provides further isolation in the GLB filename.)
// - Google Drive: blob:URL after fetch → flows through the github branch
//   today (no separate dispatch). Treated like an external URL here.
//
// Design: design/new/glb-model-sharing.md §"Caching and lookup".


/**
 * GitHub-hosted IFC. The upstream commit SHA from the GitHub API is our
 * sourceHash; no client-side hashing required.
 *
 * @param {object} args
 * @param {string} args.owner
 * @param {string} args.repo
 * @param {string} args.branch
 * @param {string} args.filePath OPFS originalFilePath of the source IFC
 * @param {string} args.shaHash git commit SHA
 * @return {object} input for glbCacheKey
 */
export function gitHubCacheKey({owner, repo, branch, filePath, shaHash}) {
  return {
    ns1: owner,
    ns2: repo,
    ns3: branch,
    sourcePath: filePath,
    sourceHash: shaHash,
  }
}


/**
 * Locally-hosted file (homepage sample at `/index.ifc`, public/ assets).
 * Lives at `BldrsLocalStorage/V1/Projects/<filePath>` in OPFS thanks to
 * `downloadToOPFS`; the GLB lands alongside.
 *
 * @param {object} args
 * @param {string} args.filePath OPFS originalFilePath (typically just the
 *   filename after `downloadToOPFS`)
 * @param {string} args.contentSha hex digest of the source bytes
 * @return {object} input for glbCacheKey
 */
export function localCacheKey({filePath, contentSha}) {
  return {
    ns1: 'BldrsLocalStorage',
    ns2: 'V1',
    ns3: 'Projects',
    sourcePath: filePath,
    sourceHash: contentSha,
  }
}


/**
 * Uploaded file (drag-and-drop, /share/v/new/<uuid>). Stored at the same
 * OPFS location as locally-hosted files.
 *
 * @param {object} args
 * @param {string} args.filePath OPFS originalFilePath (the UUID-derived name)
 * @param {string} args.contentSha hex digest of the source bytes
 * @return {object} input for glbCacheKey
 */
export function uploadCacheKey({filePath, contentSha}) {
  return {
    ns1: 'BldrsLocalStorage',
    ns2: 'V1',
    ns3: 'Projects',
    sourcePath: filePath,
    sourceHash: contentSha,
  }
}


/**
 * External URL (non-GitHub, non-local). Source ends up at the same OPFS
 * location as local files; the content sha disambiguates same-named files
 * served from different hosts.
 *
 * @param {object} args
 * @param {string} args.filePath OPFS originalFilePath (URL pathname)
 * @param {string} args.contentSha hex digest of the source bytes
 * @return {object} input for glbCacheKey
 */
export function externalCacheKey({filePath, contentSha}) {
  return {
    ns1: 'BldrsLocalStorage',
    ns2: 'V1',
    ns3: 'Projects',
    sourcePath: filePath,
    sourceHash: contentSha,
  }
}


/**
 * Google Drive source. Today's loader routes Drive through a blob URL, so
 * the cached source already sits in the shared local dir. sourceHash should
 * be Drive's `md5Checksum` when available; otherwise pass a content hash.
 *
 * @param {object} args
 * @param {string} args.filePath display name / OPFS originalFilePath
 * @param {string} args.contentSha hex digest of the source bytes (or md5)
 * @return {object} input for glbCacheKey
 */
export function googleDriveCacheKey({filePath, contentSha}) {
  return {
    ns1: 'BldrsLocalStorage',
    ns2: 'V1',
    ns3: 'Projects',
    sourcePath: filePath,
    sourceHash: contentSha,
  }
}
