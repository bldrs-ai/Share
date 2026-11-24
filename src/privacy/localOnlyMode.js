import {SAMPLE_MODELS} from '../Components/Open/sampleModelRoster'
import {CONSENT_LEVELS} from './consent'


/*
 * Local-only mode: what Browse only costs (owner's call, 2026-11-23;
 * design/new/analytics-consent.md §"Local-only mode").
 *
 * A visitor who refuses telemetry can still evaluate the viewer: files
 * from their own computer (`/v/local-only`), the hosted demo model
 * (`/v/p`) and the sample models. Models from GitHub, Google Drive or a
 * link, saving to GitHub and sharing need Functional or above.
 *
 * Only an explicit Browse only restricts. A visitor who hasn't chosen yet
 * is being asked by the About dialog right then, and isn't blocked from
 * the link that brought them; the choice applies to opens after it.
 */


/**
 * @param {string|null} level one of consent#CONSENT_LEVELS, or null
 * @return {boolean} whether this level is local-only (Browse only)
 */
export function isLocalOnlyLevel(level) {
  return level === CONSENT_LEVELS.RESTRICTED
}


/*
 * The samples are GitHub routes (sampleModelRoster.js), so they're matched
 * by repo path: `/org/repo/branch/file`, the shape of a GitHub route
 * result's getRepoPath(). The camera fragment is not part of the model.
 */
const GH_ROUTE_PREFIX = '/share/v/gh'
const SAMPLE_REPO_PATHS = new Set(
  SAMPLE_MODELS
    .map((sample) => sample.path.split('#')[0])
    .filter((path) => path.startsWith(`${GH_ROUTE_PREFIX}/`))
    .map((path) => path.slice(GH_ROUTE_PREFIX.length)),
)


/**
 * @param {object} modelPath a routes#handleRoute result
 * @return {boolean} whether it's one of the hosted sample models
 */
export function isSampleModel(modelPath) {
  if (modelPath?.kind !== 'provider' || modelPath?.provider !== 'github' ||
      typeof modelPath.getRepoPath !== 'function') {
    return false
  }
  return SAMPLE_REPO_PATHS.has(modelPath.getRepoPath())
}


/**
 * Whether local-only mode refuses to open this model: anything from
 * GitHub, Google Drive or a link (`kind` provider or url), except the
 * samples. Local files and the hosted demo model are `kind: 'file'`.
 *
 * @param {object} modelPath a routes#handleRoute result
 * @return {boolean}
 */
export function isRemoteModel(modelPath) {
  const kind = modelPath?.kind
  return (kind === 'provider' || kind === 'url') && !isSampleModel(modelPath)
}
