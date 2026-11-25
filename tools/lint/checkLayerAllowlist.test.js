import {addedPairs} from './checkLayerAllowlist.mjs'


describe('lint/checkLayerAllowlist', () => {
  const base = {
    'src/loader/Loader.js': ['src/connections/persistence.ts', 'src/store/useStore.js'],
    'src/model/bvhBuild.js': ['src/loader/loadProgress.js'],
  }

  it('passes a list that shrank', () => {
    expect(addedPairs(base, {'src/loader/Loader.js': ['src/store/useStore.js']})).toEqual([])
    expect(addedPairs(base, {})).toEqual([])
  })

  it('passes the same list', () => {
    expect(addedPairs(base, base)).toEqual([])
  })

  it('fails a new import on a listed file', () => {
    expect(addedPairs(base, {...base, 'src/model/bvhBuild.js': ['src/loader/Loader.js', 'src/loader/loadProgress.js']}))
      .toEqual([['src/model/bvhBuild.js', 'src/loader/Loader.js']])
  })

  it('fails a listed import on a new file', () => {
    expect(addedPairs(base, {...base, 'src/model/bvhPatch.js': ['src/loader/loadProgress.js']}))
      .toEqual([['src/model/bvhPatch.js', 'src/loader/loadProgress.js']])
  })
})
