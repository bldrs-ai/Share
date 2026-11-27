import {importModuleFromUrl} from '../../export/importModuleFromUrl'


jest.mock('../../export/importModuleFromUrl', () => ({importModuleFromUrl: jest.fn()}))


/**
 * The loader keeps its cache in module state, so each test gets a fresh copy.
 *
 * @return {object} `loadMarkdownGfm` and `loadedMarkdownGfm` of a fresh module instance
 */
function freshLoader() {
  let loader
  jest.isolateModules(() => {
    loader = require('./markdownGfm')
  })
  return loader
}


describe('markdownGfm', () => {
  const plugin = () => undefined

  beforeEach(() => {
    importModuleFromUrl.mockReset()
  })

  it('has no plugin before a load, and none while one is pending', () => {
    const {loadMarkdownGfm, loadedMarkdownGfm} = freshLoader()
    expect(loadedMarkdownGfm()).toBeNull()
    importModuleFromUrl.mockReturnValue(new Promise(() => undefined))
    loadMarkdownGfm()
    expect(loadedMarkdownGfm()).toBeNull()
  })

  it('hands out the plugin once the load has resolved, for a remount to seed from', async () => {
    const {loadMarkdownGfm, loadedMarkdownGfm} = freshLoader()
    importModuleFromUrl.mockResolvedValue({default: plugin})
    await expect(loadMarkdownGfm()).resolves.toBe(plugin)
    expect(loadedMarkdownGfm()).toBe(plugin)
    // A second ask is served from the cache, not fetched again.
    await loadMarkdownGfm()
    expect(importModuleFromUrl).toHaveBeenCalledTimes(1)
  })

  it('has no plugin after a failed load, and the next load fetches again', async () => {
    const {loadMarkdownGfm, loadedMarkdownGfm} = freshLoader()
    importModuleFromUrl.mockRejectedValueOnce(new Error('offline'))
    await expect(loadMarkdownGfm()).rejects.toThrow('offline')
    expect(loadedMarkdownGfm()).toBeNull()
    importModuleFromUrl.mockResolvedValue({default: plugin})
    await expect(loadMarkdownGfm()).resolves.toBe(plugin)
    expect(importModuleFromUrl).toHaveBeenCalledTimes(2)
    expect(loadedMarkdownGfm()).toBe(plugin)
  })
})
