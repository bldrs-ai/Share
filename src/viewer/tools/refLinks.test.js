/* eslint-disable no-magic-numbers */
import useStore from '../../store/useStore'
import {describeRef, jumpToRef, refOfLinkUri} from './refLinks'
import {registerSelectionFunnel} from './selectionFunnel'
import {globalIdOf, loadFixture, makeStoreFunnel} from './tools.fixture'


jest.mock('../ShareViewer', () => ({}))
jest.mock('postprocessing', () => ({
  BlendFunction: {SCREEN: 1},
}))


const WHERE = {origin: 'https://share.example', pathname: '/share/v/p/index.ifc/1/2/3/10/100'}


describe('viewer/tools/refLinks', () => {
  describe('refOfLinkUri', () => {
    it.each([
      ['ref:e123', 'e123'],
      ['ref:o1.2.3', 'o1.2.3'],
      ['ref:nUpper%20Jaw/teeth/Tooth_07', 'nUpper%20Jaw/teeth/Tooth_07'],
      [`ref:g${globalIdOf(100)}`, `g${globalIdOf(100)}`],
    ])('accepts %s', (uri, ref) => {
      expect(refOfLinkUri(uri)).toBe(ref)
    })

    it.each([
      ['ref:'], ['ref:x1'], ['ref:e12a'], ['ref:o1..2'], ['ref:gshort'],
      ['https://a.example'], ['javascript:alert(1)'], ['e123'], [undefined],
    ])('rejects %s', (uri) => {
      expect(refOfLinkUri(uri)).toBeNull()
    })
  })


  describe('against a loaded model', () => {
    let unregister

    beforeEach(async () => {
      await loadFixture()
      useStore.setState({isModelReady: true})
      unregister = registerSelectionFunnel(makeStoreFunnel())
    })

    afterEach(() => {
      unregister()
    })

    it('links an element to its selection permalink, whichever way the ref names it', () => {
      expect(describeRef('e102', WHERE)).toEqual({ok: true, permalink: 'https://share.example/share/v/p/index.ifc#sel:e102'})
      // A GlobalId mention links as the canonical element ref.
      expect(describeRef(`g${globalIdOf(102)}`, WHERE).permalink).toBe(
        'https://share.example/share/v/p/index.ifc#sel:e102')
    })

    it('says why a ref that is not in the open model does not resolve', () => {
      const result = describeRef('e999999', WHERE)
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/isn't in the model/)
    })

    it('says to open the model when none is loaded', () => {
      useStore.setState({model: null})
      const result = describeRef('e102', WHERE)
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/Open the model/)
    })

    it('does not resolve while the model is still being set up', () => {
      useStore.setState({isModelReady: false})
      expect(describeRef('e102', WHERE).ok).toBe(false)
    })

    it('selects the element on a jump, as view.select does', () => {
      expect(useStore.getState().selectedAnchorIds ?? []).not.toContain(102)
      jumpToRef('e102')
      expect((useStore.getState().selectedAnchorIds ?? []).map(Number)).toEqual([102])
    })

    it('changes nothing for a ref that does not resolve', () => {
      jumpToRef('e101')
      expect(() => jumpToRef('e999999')).toThrow(/did not resolve/)
      expect((useStore.getState().selectedAnchorIds ?? []).map(Number)).toEqual([101])
    })
  })
})
