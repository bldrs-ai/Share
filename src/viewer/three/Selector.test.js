/* eslint-disable no-magic-numbers */
import Selector from './Selector'


/**
 * Build a richly-populated fork-selector stub. Every method the
 * Selector facade delegates to is present as a jest.fn() so individual
 * tests can assert call counts and arguments. The async stubs return
 * resolved promises so the facade's `await` chains complete cleanly.
 *
 * @return {object}
 */
function makeForkSelectorStub() {
  return {
    selection: {
      material: null,
      meshes: [],
      unpick: jest.fn(),
    },
    preselection: {
      material: null,
      meshes: [],
      unpick: jest.fn(),
      toggleVisibility: jest.fn(),
      pick: jest.fn(() => Promise.resolve()),
      pickByID: jest.fn(() => Promise.resolve()),
    },
    pickIfcItemsByID: jest.fn(() => Promise.resolve()),
    unpickIfcItems: jest.fn(),
  }
}


describe('viewer/three/Selector', () => {
  describe('construction + hasForkSelector', () => {
    it('reports false with no fork selector', () => {
      const selector = new Selector(null)
      expect(selector.hasForkSelector).toBe(false)
    })

    it('reports true with a fork selector attached', () => {
      const selector = new Selector(makeForkSelectorStub())
      expect(selector.hasForkSelector).toBe(true)
    })

    it('setForkSelector swaps the underlying object', () => {
      const selector = new Selector(null)
      expect(selector.hasForkSelector).toBe(false)
      const fork = makeForkSelectorStub()
      selector.setForkSelector(fork)
      expect(selector.hasForkSelector).toBe(true)
      selector.unpick()
      expect(fork.unpickIfcItems).toHaveBeenCalledTimes(1)
    })
  })


  describe('material accessors', () => {
    it('getSelectionMaterial returns the fork value', () => {
      const fork = makeForkSelectorStub()
      const mat = {name: 'sel'}
      fork.selection.material = mat
      expect(new Selector(fork).getSelectionMaterial()).toBe(mat)
    })

    it('getPreselectionMaterial returns the fork value', () => {
      const fork = makeForkSelectorStub()
      const mat = {name: 'presel'}
      fork.preselection.material = mat
      expect(new Selector(fork).getPreselectionMaterial()).toBe(mat)
    })

    it('getSelectionMaterial returns null without a fork selector', () => {
      expect(new Selector(null).getSelectionMaterial()).toBeNull()
    })

    it('getPreselectionMaterial returns null without a fork selector', () => {
      expect(new Selector(null).getPreselectionMaterial()).toBeNull()
    })

    it('getSelectionMaterial tolerates a partial fork (no selection slot)', () => {
      expect(new Selector({}).getSelectionMaterial()).toBeNull()
    })

    it('setSelectionMaterial writes through to the fork', () => {
      const fork = makeForkSelectorStub()
      const mat = {name: 'sel'}
      new Selector(fork).setSelectionMaterial(mat)
      expect(fork.selection.material).toBe(mat)
    })

    it('setPreselectionMaterial writes through to the fork', () => {
      const fork = makeForkSelectorStub()
      const mat = {name: 'presel'}
      new Selector(fork).setPreselectionMaterial(mat)
      expect(fork.preselection.material).toBe(mat)
    })

    it('setSelectionMaterial no-ops on a missing fork', () => {
      // Should not throw.
      expect(() => new Selector(null).setSelectionMaterial({})).not.toThrow()
    })

    it('setSelectionMaterial no-ops when the fork has no selection slot', () => {
      const fork = {}
      expect(() => new Selector(fork).setSelectionMaterial({})).not.toThrow()
      expect(fork).toEqual({})
    })
  })


  describe('mesh accessors', () => {
    it('getSelectionMeshes returns the fork array', () => {
      const fork = makeForkSelectorStub()
      const meshA = {name: 'a'}
      fork.selection.meshes = [meshA]
      expect(new Selector(fork).getSelectionMeshes()).toEqual([meshA])
    })

    it('getPreselectionMeshes returns the fork array', () => {
      const fork = makeForkSelectorStub()
      const meshA = {name: 'a'}
      fork.preselection.meshes = [meshA]
      expect(new Selector(fork).getPreselectionMeshes()).toEqual([meshA])
    })

    it('getSelectionMeshes returns [] without a fork selector', () => {
      expect(new Selector(null).getSelectionMeshes()).toEqual([])
    })

    it('getPreselectionMeshes returns [] without a fork selector', () => {
      expect(new Selector(null).getPreselectionMeshes()).toEqual([])
    })
  })


  describe('selection actions', () => {
    it('pickByIds calls the fork with the same arguments', async () => {
      const fork = makeForkSelectorStub()
      const selector = new Selector(fork)
      await selector.pickByIds(0, [1, 2, 3], true, false)
      expect(fork.pickIfcItemsByID).toHaveBeenCalledWith(0, [1, 2, 3], true, false)
    })

    it('pickByIds defaults focusSelection=false, removePrevious=true', async () => {
      const fork = makeForkSelectorStub()
      await new Selector(fork).pickByIds(0, [1])
      expect(fork.pickIfcItemsByID).toHaveBeenCalledWith(0, [1], false, true)
    })

    it('pickByIds awaits the fork promise', async () => {
      const fork = makeForkSelectorStub()
      let resolved = false
      fork.pickIfcItemsByID.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 1))
        resolved = true
      })
      await new Selector(fork).pickByIds(0, [1])
      expect(resolved).toBe(true)
    })

    it('pickByIds no-ops on a fork without the method', async () => {
      const selector = new Selector({})
      await expect(selector.pickByIds(0, [1])).resolves.toBeUndefined()
    })

    it('unpick delegates to fork.unpickIfcItems', () => {
      const fork = makeForkSelectorStub()
      new Selector(fork).unpick()
      expect(fork.unpickIfcItems).toHaveBeenCalledTimes(1)
    })

    it('unpick no-ops without a fork selector', () => {
      expect(() => new Selector(null).unpick()).not.toThrow()
    })

    it('clearSelection delegates to fork.selection.unpick', () => {
      const fork = makeForkSelectorStub()
      new Selector(fork).clearSelection()
      expect(fork.selection.unpick).toHaveBeenCalledTimes(1)
    })

    it('clearSelection no-ops on a partial fork', () => {
      expect(() => new Selector({selection: {}}).clearSelection()).not.toThrow()
    })
  })


  describe('preselection actions', () => {
    it('clearPreselection delegates to fork.preselection.unpick', () => {
      const fork = makeForkSelectorStub()
      new Selector(fork).clearPreselection()
      expect(fork.preselection.unpick).toHaveBeenCalledTimes(1)
    })

    it('togglePreselectionVisibility passes through the visible flag', () => {
      const fork = makeForkSelectorStub()
      new Selector(fork).togglePreselectionVisibility(false)
      expect(fork.preselection.toggleVisibility).toHaveBeenCalledWith(false)
    })

    it('togglePreselectionVisibility no-ops on missing method', () => {
      expect(() =>
        new Selector({preselection: {}}).togglePreselectionVisibility(true),
      ).not.toThrow()
    })

    it('preselectFromPick forwards the raycast hit', async () => {
      const fork = makeForkSelectorStub()
      const hit = {object: {}, faceIndex: 7}
      await new Selector(fork).preselectFromPick(hit)
      expect(fork.preselection.pick).toHaveBeenCalledWith(hit)
    })

    it('preselectFromPick awaits the fork promise', async () => {
      const fork = makeForkSelectorStub()
      let resolved = false
      fork.preselection.pick.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 1))
        resolved = true
      })
      await new Selector(fork).preselectFromPick({})
      expect(resolved).toBe(true)
    })

    it('preselectFromPick no-ops on a fork without the method', async () => {
      const selector = new Selector({preselection: {}})
      await expect(selector.preselectFromPick({})).resolves.toBeUndefined()
    })

    it('preselectByIds forwards all arguments', async () => {
      const fork = makeForkSelectorStub()
      await new Selector(fork).preselectByIds(2, [11, 12], true, false)
      expect(fork.preselection.pickByID).toHaveBeenCalledWith(2, [11, 12], true, false)
    })

    it('preselectByIds defaults focusSelection=false, removePrevious=true', async () => {
      const fork = makeForkSelectorStub()
      await new Selector(fork).preselectByIds(0, [1])
      expect(fork.preselection.pickByID).toHaveBeenCalledWith(0, [1], false, true)
    })

    it('preselectByIds no-ops on a fork without the method', async () => {
      const selector = new Selector({preselection: {}})
      await expect(selector.preselectByIds(0, [1])).resolves.toBeUndefined()
    })
  })


  describe('method binding', () => {
    // Each delegating method calls .call(this._forkSelector...) to
    // preserve `this` inside the fork. This matters when the fork's
    // pickIfcItemsByID etc. read `this.selection` internally.
    it('pickByIds preserves the fork as `this`', async () => {
      const fork = makeForkSelectorStub()
      fork.pickIfcItemsByID = jest.fn(function() {
        // eslint-disable-next-line no-invalid-this
        this._wasCalled = true
      })
      await new Selector(fork).pickByIds(0, [1])
      expect(fork._wasCalled).toBe(true)
    })

    it('preselectFromPick preserves fork.preselection as `this`', async () => {
      const fork = makeForkSelectorStub()
      fork.preselection.pick = jest.fn(function() {
        // eslint-disable-next-line no-invalid-this
        this._wasCalled = true
      })
      await new Selector(fork).preselectFromPick({})
      expect(fork.preselection._wasCalled).toBe(true)
    })
  })
})
