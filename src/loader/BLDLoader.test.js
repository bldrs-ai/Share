import BLDLoader from './BLDLoader'


describe('BLDLoader', () => {
  // TODO(pablo)
  it.skip('parses', async () => {
    const loader = new BLDLoader()
    const data = `
{
  "metadata": {
    "version": 0.1,
    "generator": "https://github.com/bldrs-ai/headless-three"
  },
  "scale": 0.9,
  "objScale": 0.0005,
  "objects": [
    {
      "href": "file:///Al2O3.pdb",
      "pos": [0, 0, 0]
    }
  ]
}
`
    const model = await loader.parse(data)
    expect(model).toBe(1)
  })
})
