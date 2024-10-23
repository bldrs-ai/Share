import BLDLoader from './BLDLoader'


describe('BLDLoader', () => {
  // TODO(pablo)
  it.skip('parses', async () => {
    const loader = new BLDLoader()
    const data = ```
{
  "metadata": {
    "version": 0.1,
    "generator": "https://github.com/bldrs-ai/headless-three"
  },
  "scale": 0.9,
  "objScale": 0.0005,
  "objects": [
    {
      "href": "Al2O3.pdb",
      "pos": [0, 0, 0]
    }
}
```
    const basePath = undefined
    const onLoad = jest.fn()
    const onError = jest.fn()
    await loader.parse(data, basePath, onLoad, onError)
    expect(onLoad.mock.calls).toHaveLength(1)
    expect(onError.mock.calls).toHaveLength(0)
  })
})
