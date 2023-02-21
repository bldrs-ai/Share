import {getSVGGroup, getSVGMesh, getSVGSprite} from './svg'


jest.mock('./svg')


describe('svg', () => {
  it('test getSVGSprite', async () => {
    getSVGGroup.mockResolvedValue('getSVGGroup')
    const svgGroup = await getSVGGroup()
    expect(svgGroup).toBe('getSVGGroup')
  })

  it('test getSVGSprite', async () => {
    getSVGMesh.mockResolvedValue('getSVGMesh')
    const svgMesh = await getSVGMesh()
    expect(svgMesh).toBe('getSVGMesh')
  })

  it('test getSVGSprite', async () => {
    getSVGSprite.mockResolvedValue('getSVGSprite')
    const svgSprite = await getSVGSprite()
    expect(svgSprite).toBe('getSVGSprite')
  })
})
