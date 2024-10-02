import BLDLoader from './BLDLoader'


describe('BLDLoader', () => {
  it('parses', async () => {
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
//    await loader.parse(data, basePath, onLoad, onError) 
  })
})
