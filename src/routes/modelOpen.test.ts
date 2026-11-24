import {modelOpenId} from './modelOpen'


describe('routes/modelOpen', () => {
  it('gives one route result one open, and another route result for the same model another', () => {
    const a = {downloadUrl: 'https://example.test/a.ifc'}
    const aAgain = {downloadUrl: 'https://example.test/a.ifc'}
    const first = modelOpenId(a)
    expect(first).toBeGreaterThan(0)
    // A theme rebuild or an auth re-run loads the same route result.
    expect(modelOpenId(a)).toBe(first)
    // In-app A → B → A: Share sets a new route result for the return.
    expect(modelOpenId(aAgain)).not.toBe(first)
  })

  it('is 0 for no route', () => {
    expect(modelOpenId(null)).toBe(0)
    expect(modelOpenId(undefined)).toBe(0)
  })
})
