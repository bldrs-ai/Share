import {SAMPLE_MODELS} from '../Components/Open/sampleModelRoster'
import {handleRoute} from '../routes/routes'
import {CONSENT_LEVELS} from './consent'
import {isLocalOnlyLevel, isRemoteModel, isSampleModel} from './localOnlyMode'


/**
 * The route result Share.jsx would get for a `/share/v/gh/...` path.
 *
 * @param {string} path a /share/v/gh path, camera hash allowed
 * @return {object}
 */
function ghRoute(path) {
  const [org, repo, branch, ...rest] = path.split('#')[0].replace('/share/v/gh/', '').split('/')
  return handleRoute('/share/v/gh', {org, repo, branch, '*': rest.join('/')})
}


describe('localOnlyMode', () => {
  test('only Browse only is local-only; undecided is not', () => {
    expect(isLocalOnlyLevel(CONSENT_LEVELS.RESTRICTED)).toBe(true)
    expect(isLocalOnlyLevel(CONSENT_LEVELS.FUNCTIONAL)).toBe(false)
    expect(isLocalOnlyLevel(CONSENT_LEVELS.PUBLIC)).toBe(false)
    expect(isLocalOnlyLevel(null)).toBe(false)
  })

  test('a GitHub model is remote', () => {
    expect(isRemoteModel(ghRoute('/share/v/gh/bldrs-ai/test-models/main/ifc/misc/box.ifc'))).toBe(true)
  })

  // The samples are GitHub routes, and Browse only keeps them.
  test.each(SAMPLE_MODELS.map((sample) => [sample.name, sample.path]))('the %s sample is not remote', (_, path) => {
    const route = ghRoute(path)
    expect(isSampleModel(route)).toBe(true)
    expect(isRemoteModel(route)).toBe(false)
  })

  test('a sample with an element path selected is still the sample', () => {
    expect(isRemoteModel(ghRoute('/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb/1/2'))).toBe(false)
  })

  test('another file in a sample repo is remote', () => {
    expect(isRemoteModel(ghRoute('/share/v/gh/bldrs-ai/test-models/main/pdb/other.pdb'))).toBe(true)
  })

  test('Google Drive and web-address models are remote', () => {
    expect(isRemoteModel(handleRoute('/share/v/g', {'*': '1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO'}))).toBe(true)
    expect(isRemoteModel(handleRoute('/share/v/u', {'*': 'https://example.com/model.ifc'}))).toBe(true)
  })

  test('local files and the hosted demo model are not remote', () => {
    expect(isRemoteModel(handleRoute('/share/v/p', {'*': 'index.ifc'}))).toBe(false)
    expect(isRemoteModel(handleRoute('/share/v/local-only', {'*': 'AA77535-D1B6-49A9-915B-41343B08BF83.ifc'})))
      .toBe(false)
  })
})
