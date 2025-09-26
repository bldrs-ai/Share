import {handleRoute} from './routes'


describe('Share', () => {
  it('handleRoute parses ifc and obj filepaths', () => {
    expect(handleRoute('/share', '/share/v/p', {'*': 'as_Ifcdf.ifc/1234'})).toStrictEqual({
      filepath: '/as_Ifcdf.ifc',
      eltPath: '/1234',
    })
  })


  it('handleRoute parses mixed-case ifc filepaths', () => {
    for (const ext of [
      'ifc', 'Ifc', 'IFC', 'IfC', 'iFc', 'IFc',
    ]) {
      const inPath = `as_${ext}df.${ext}/1234`
      expect(handleRoute('/share', '/share/v/p', {'*': inPath})).toStrictEqual({
        filepath: `/as_${ext}df.${ext}`,
        eltPath: '/1234',
      })
    }
  })
})
