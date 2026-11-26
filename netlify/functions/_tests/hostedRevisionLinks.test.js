/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import {createHostedRevisionResolver} from '../_lib/hostedRevisionLinks.js'


const FIRST = {
  owner: 'bldrs-ai',
  repo: 'test-models',
  commit: '1111111111111111111111111111111111111111',
  path: 'ifc/misc/box.ifc',
}
const SECOND = {...FIRST, commit: '2222222222222222222222222222222222222222'}
const PUBLISHER = 'github|publisher'
const READER = 'github|reader'
const PUBLIC_AT_SOURCE = 'public-at-source'
const RESTRICTED_AT_SOURCE = 'restricted-at-source'


/**
 * @param {Function} checkSourceAccess
 * @return {object} The resolver and its isolated fixture store
 */
function fixture(checkSourceAccess = jest.fn().mockResolvedValue(PUBLIC_AT_SOURCE)) {
  const records = new Map()
  const store = {
    get: jest.fn((key) => records.get(key)),
    insert: jest.fn((key, record) => {
      if (records.has(key)) {
        return false
      }
      records.set(key, record)
      return true
    }),
  }
  return {...createHostedRevisionResolver({store, checkSourceAccess}), records, store, checkSourceAccess}
}


describe('hosted revision links', () => {
  it('keeps each issued link pinned to its exact revision', async () => {
    const {create, resolve, records} = fixture()
    const source = {...FIRST, ignored: 'not part of the link'}
    const original = await create(source, PUBLISHER)
    source.commit = SECOND.commit
    const latest = await create(source, PUBLISHER)

    expect(original).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(latest).not.toBe(original)
    expect(records.has(original)).toBe(false)
    await expect(resolve(original)).resolves.toEqual({source: FIRST, visibility: PUBLIC_AT_SOURCE})
    await expect(resolve(latest)).resolves.toEqual({source: SECOND, visibility: PUBLIC_AT_SOURCE})
  })

  it('requires the publisher to have source access and an exact revision', async () => {
    const {create, store} = fixture(jest.fn().mockResolvedValue(null))
    await expect(create(FIRST, PUBLISHER)).resolves.toBeNull()
    await expect(create({...FIRST, commit: 'main'}, PUBLISHER)).resolves.toBeNull()
    await expect(create({...FIRST, path: '../box.ifc'}, PUBLISHER)).resolves.toBeNull()
    await expect(create(FIRST, null)).resolves.toBeNull()
    expect(store.insert).not.toHaveBeenCalled()
  })

  it('returns the same result for malformed, unknown and access-denied links', async () => {
    const {create, resolve, store} = fixture(jest.fn((_source, actor) =>
      actor === PUBLISHER || actor === READER ? RESTRICTED_AT_SOURCE : null))
    const token = await create(FIRST, PUBLISHER)
    const unknown = await fixture().create(FIRST, PUBLISHER)

    await expect(resolve(`${token}=`, READER)).resolves.toBeNull()
    expect(store.get).not.toHaveBeenCalled()
    await expect(resolve(unknown, READER)).resolves.toBeNull()
    await expect(resolve(token)).resolves.toBeNull()
    await expect(resolve(token, 'github|unrelated')).resolves.toBeNull()
    await expect(resolve(token, READER)).resolves.toEqual({source: FIRST, visibility: RESTRICTED_AT_SOURCE})
  })

  it('rechecks source access after creation', async () => {
    const {create, resolve, checkSourceAccess} = fixture()
    const token = await create(FIRST, PUBLISHER)
    checkSourceAccess.mockResolvedValue(null)
    await expect(resolve(token)).resolves.toBeNull()
    expect(checkSourceAccess).toHaveBeenLastCalledWith(FIRST, null)
  })

  it('keeps restricted metadata from signed-out recipients even if the adapter labels it', async () => {
    const {create, resolve} = fixture(jest.fn().mockResolvedValue(RESTRICTED_AT_SOURCE))
    const token = await create(FIRST, PUBLISHER)
    await expect(resolve(token)).resolves.toBeNull()
  })

  it('returns no token when the store refuses the insert', async () => {
    const {create, store} = fixture()
    store.insert.mockResolvedValue(false)
    await expect(create(FIRST, PUBLISHER)).rejects.toThrow('Could not create revision link')
  })
})
