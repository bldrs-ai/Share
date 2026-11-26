import {fixtureBlobSha} from '../../__mocks__/fixtureBlobSha'


// These refs all point at the same GitHub path. Give each content revision
// a distinct blob identity so the model cache cannot mask a bad ref.
export const VERSION_HISTORY_PATH = 'ifc/misc/version-history.ifc'
const SHA_LENGTH = 40
export const ADVANCED_HEAD_COOKIE = 'mockVersionHistoryAdvanced'

export const OLDER_VERSION = {
  sha: '1'.repeat(SHA_LENGTH),
  message: 'Add the box',
  fixture: 'box.ifc',
  project: 'Proxy with extruded box',
}
export const NEWER_VERSION = {
  sha: '2'.repeat(SHA_LENGTH),
  message: 'Add the exterior wall',
  fixture: 'cut-plane-pick.ifc',
  project: 'Exterior wall in front of an interior box',
}
export const ADVANCED_VERSION = {
  ...NEWER_VERSION,
  sha: '3'.repeat(SHA_LENGTH),
  message: 'Advance the branch',
}


/** @return The mock file history, newest first. */
export function versionHistory(advanced: boolean) {
  return advanced ? [ADVANCED_VERSION, NEWER_VERSION, OLDER_VERSION] : [NEWER_VERSION, OLDER_VERSION]
}


/** @return Contents API metadata for the requested branch or commit. */
export function versionContents(ref: string | null, advanced: boolean) {
  const versions = versionHistory(advanced)
  const version = ref === 'main' ? versions[0] : versions.find(({sha}) => sha === ref)
  if (!version) {
    return null
  }
  const fixture = `ifc/misc/${version.fixture}`
  return {
    name: 'version-history.ifc',
    path: VERSION_HISTORY_PATH,
    sha: fixtureBlobSha(fixture),
    download_url: `/__test_fixtures__/bldrs-ai/test-models/main/${fixture}`,
    type: 'file',
  }
}


/** @return Commits API metadata for the same file. */
export function versionCommits(advanced: boolean) {
  const author = {name: 'Fixture author', date: '2026-11-01T12:00:00Z'}
  return versionHistory(advanced).map(({sha, message}) => ({sha, commit: {author, message}}))
}
