import Utils from './Utils'


describe('WidgetApi/Utils', () => {
  /**
   * @param {object} table map of expressId -> globalId
   * @return {object} stub searchIndex
   */
  function stubSearchIndex(table) {
    return {
      getGlobalIdByExpressId: (id) => table[id],
    }
  }


  describe('getElementsGlobalIds', () => {
    it('returns [] when passed null', () => {
      const utils = new Utils(stubSearchIndex({}))
      expect(utils.getElementsGlobalIds(null)).toEqual([])
    })

    it('returns [] when passed an empty array', () => {
      const utils = new Utils(stubSearchIndex({}))
      expect(utils.getElementsGlobalIds([])).toEqual([])
    })

    it('translates each expressId via the searchIndex in order', () => {
      const utils = new Utils(stubSearchIndex({10: 'gid-a', 20: 'gid-b'}))
      expect(utils.getElementsGlobalIds(['10', '20'])).toEqual(['gid-a', 'gid-b'])
    })

    it('drops expressIds that the searchIndex does not resolve', () => {
      const utils = new Utils(stubSearchIndex({10: 'gid-a'}))
      expect(utils.getElementsGlobalIds(['10', '99'])).toEqual(['gid-a'])
    })

    // TODO: getElementsGlobalIds crashes when `elementsExpressIds` is
    // `undefined` (reads `.length` on undefined) even though it guards
    // explicitly against `null`. Refactor target: unify the guards or
    // document the contract.
    it('throws when passed undefined (missing guard)', () => {
      const utils = new Utils(stubSearchIndex({}))
      expect(() => utils.getElementsGlobalIds(undefined)).toThrow(TypeError)
    })
  })
})
