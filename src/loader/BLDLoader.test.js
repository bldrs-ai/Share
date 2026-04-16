/* eslint-disable no-magic-numbers, require-await */
import {Object3D} from 'three'
import {load as mockLoad} from './Loader'
import BLDLoader from './BLDLoader'


// BLDLoader recursively calls `load()` from Loader.js to resolve each
// referenced sub-model. Mock it so we can assert the wiring without
// needing the full network/OPFS stack.
jest.mock('./Loader', () => ({
  load: jest.fn(),
}))


// TODO: BLDLoader.parse() ends with `debug().trace('returning root:')`
// at BLDLoader.js:65. The project's `debug()` helper returns `mockLog`
// whenever the debug level is below the configured threshold, which is
// the default in production — and mockLog in utils/debug.js does NOT
// define a `trace` method. So the final log call blows up with
// "debug(...).trace is not a function" every time BLDLoader finishes
// parsing a .bld model in prod. This is the only `.trace()` call in
// the codebase. Fix: either drop the trace line or add a no-op `trace`
// to mockLog. For now the tests mock `../utils/debug` to a full
// console-shaped stub so the current behavior can be exercised.
jest.mock('../utils/debug', () => ({
  __esModule: true,
  default: () => ({
    log: () => {},
    warn: () => {},
    error: () => {},
    time: () => {},
    timeEnd: () => {},
    trace: () => {},
  }),
  disableDebug: () => {},
  setDebugLevel: () => {},
}))


/**
 * Build a fresh Object3D stand-in for a loaded sub-model. A fresh object
 * per call lets each test make distinct assertions about position/scale.
 *
 * @return {Object3D}
 */
function makeSubModel() {
  return new Object3D()
}


describe('BLDLoader', () => {
  beforeEach(() => {
    mockLoad.mockReset()
    mockLoad.mockImplementation(async () => makeSubModel())
  })


  describe('parse', () => {
    it('throws when data is undefined', async () => {
      const loader = new BLDLoader()
      await expect(loader.parse(undefined, 'http://example/')).rejects.toThrow()
    })

    it('returns an Object3D root even for an empty objects list', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({objects: []})
      const root = await loader.parse(data, 'http://example/')

      expect(root).toBeInstanceOf(Object3D)
      expect(root.children.length).toBe(0)
      expect(mockLoad).not.toHaveBeenCalled()
    })

    it('applies model.scale to the root', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({scale: 2, objects: []})
      const root = await loader.parse(data, 'http://example/')

      expect(root.scale.x).toBe(2)
      expect(root.scale.y).toBe(2)
      expect(root.scale.z).toBe(2)
    })

    it('loads each referenced object via Loader.load and attaches it to the root', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({
        objects: [
          {href: 'a.pdb'},
          {href: 'b.pdb'},
        ],
      })
      const root = await loader.parse(data, 'http://example/')

      expect(mockLoad).toHaveBeenCalledTimes(2)
      // Sub-model URLs are resolved against the base path.
      expect(mockLoad.mock.calls[0][0]).toBe('http://example/a.pdb')
      expect(mockLoad.mock.calls[1][0]).toBe('http://example/b.pdb')
      expect(root.children.length).toBe(2)
    })

    it('lets model.base override the passed-in basePath', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({
        base: 'http://override/',
        objects: [{href: 'x.pdb'}],
      })
      await loader.parse(data, 'http://example/')

      expect(mockLoad.mock.calls[0][0]).toBe('http://override/x.pdb')
    })

    // TODO: BLDLoader strips the `blob:` prefix off basePath before
    // resolving sub-URLs (BLDLoader.js:39-41). The resulting string is
    // not a valid URL scheme, so `new URL(relativeHref, basePath)` can
    // throw on any non-absolute href. Refactor target: resolve children
    // against the real model location, not the blob URL.
    it('strips the blob: prefix off basePath before resolving', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({
        // Absolute href side-steps the URL-resolve crash path above.
        objects: [{href: 'http://a.com/x.pdb'}],
      })
      await loader.parse(data, 'blob:http://example/')

      expect(mockLoad.mock.calls[0][0]).toBe('http://a.com/x.pdb')
    })

    it('sets sub-model position from objRef.pos', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({
        objects: [{href: 'a.pdb', pos: [1, 2, 3]}],
      })
      const root = await loader.parse(data, 'http://example/')

      expect(root.children[0].position.x).toBe(1)
      expect(root.children[0].position.y).toBe(2)
      expect(root.children[0].position.z).toBe(3)
    })

    it('ignores objRef.pos when it has the wrong length', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({
        objects: [{href: 'a.pdb', pos: [1, 2]}],
      })
      const root = await loader.parse(data, 'http://example/')

      // pos was malformed → default position preserved
      expect(root.children[0].position.x).toBe(0)
      expect(root.children[0].position.y).toBe(0)
      expect(root.children[0].position.z).toBe(0)
    })

    it('objRef.scale overrides model.objScale', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({
        objScale: 0.5, // default applied to children without their own scale
        objects: [
          {href: 'a.pdb', scale: 3}, // explicit child scale wins
          {href: 'b.pdb'}, // falls back to objScale
        ],
      })
      const root = await loader.parse(data, 'http://example/')

      expect(root.children[0].scale.x).toBe(3)
      expect(root.children[1].scale.x).toBe(0.5)
    })

    // TODO: BLDLoader.parse does no validation of the model.objects
    // field — a missing or non-array value crashes at the for-of loop
    // with a confusing "x is not iterable" error. Refactor target:
    // validate or default to an empty list before iterating.
    it('crashes when model.objects is missing (no validation)', async () => {
      const loader = new BLDLoader()
      const data = JSON.stringify({scale: 1})
      await expect(loader.parse(data, 'http://example/')).rejects.toThrow()
    })
  })
})
