/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import {hostedRevisionBlobStore} from '../_lib/hostedRevisionBlobStore.js'
import {createHostedRevisionResolver} from '../_lib/hostedRevisionLinks.js'
import {createFakeBlobs} from './fakeBlobs.js'


const REVISION = {
  owner: 'bldrs-ai',
  repo: 'test-models',
  commit: '1111111111111111111111111111111111111111',
  path: 'ifc/misc/box.ifc',
}
const NEXT_REVISION = {...REVISION, commit: '2222222222222222222222222222222222222222'}


describe('hosted revision Blobs store candidate', () => {
  it('creates only one value when two writers try the same digest', async () => {
    const fake = createFakeBlobs()
    const store = hostedRevisionBlobStore(fake.store)
    const key = 'fixture-digest'

    const results = await Promise.all([store.insert(key, REVISION), store.insert(key, NEXT_REVISION)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(fake.requests.filter(({method}) => method === 'PUT').map(({ifNoneMatch}) => ifNoneMatch))
      .toEqual(['*', '*'])
    await expect(store.get(key)).resolves.toEqual(results[0] ? REVISION : NEXT_REVISION)
  })

  it('resolves the saved revision from a new resolver using the same store', async () => {
    const fake = createFakeBlobs()
    const checkSourceAccess = jest.fn().mockResolvedValue('public-at-source')
    const createResolver = () => createHostedRevisionResolver({
      store: hostedRevisionBlobStore(fake.store),
      checkSourceAccess,
    })

    const token = await createResolver().create(REVISION, 'github|publisher')
    await createResolver().create(NEXT_REVISION, 'github|publisher')

    await expect(createResolver().resolve(token)).resolves.toEqual({
      source: REVISION,
      visibility: 'public-at-source',
    })
    expect(fake.requests.some(({key}) => key.includes(token))).toBe(false)
  })
})
