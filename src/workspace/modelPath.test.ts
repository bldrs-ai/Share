import {modelPathFromPathname} from './modelPath'


describe('modelPathFromPathname', () => {
  it('strips IFC expressID element paths', () => {
    expect(modelPathFromPathname('/share/v/p/index.ifc/81/621'))
      .toBe('/share/v/p/index.ifc')
  })

  it('strips deep occurrence paths on hosted models', () => {
    expect(modelPathFromPathname(
      '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc/88/111/153/3768/199961'))
      .toBe('/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc')
  })

  it('leaves element-free model routes alone', () => {
    expect(modelPathFromPathname('/share/v/p/index.ifc')).toBe('/share/v/p/index.ifc')
    expect(modelPathFromPathname('/share/v/new/4d6da269-9169.ifc'))
      .toBe('/share/v/new/4d6da269-9169.ifc')
  })

  it('keeps numeric-looking file segments', () => {
    expect(modelPathFromPathname('/share/v/gh/o/r/main/123.ifc'))
      .toBe('/share/v/gh/o/r/main/123.ifc')
  })

  it('handles a trailing slash after the element path', () => {
    expect(modelPathFromPathname('/share/v/p/index.ifc/81/')).toBe('/share/v/p/index.ifc')
  })
})
