import {geometryItemLabel, labelForGeometryId} from './geometryLabels'


describe('utils/geometryLabels', () => {
  const SOLID_ID = 250
  const FACE_ID = 6321
  const NEMA_FACE_ID = 29
  describe('geometryItemLabel', () => {
    it('prefers a meaningful in-file name over the synthetic label', () => {
      const item = {type: 'MANIFOLD_SOLID_BREP', Name: {value: 'Boss-Extrude7'}}
      expect(geometryItemLabel(SOLID_ID, item)).toBe('Boss-Extrude7')
    })

    it('treats exporter placeholders as unnamed', () => {
      // SolidWorks writes 'NONE' for anonymous faces — that is not a name.
      const item = {type: 'ADVANCED_FACE', Name: {value: 'NONE'}}
      expect(geometryItemLabel(FACE_ID, item)).toBe('Face #6321')
    })

    it('maps solid and shell types to their display kinds', () => {
      expect(geometryItemLabel(1, {type: 'BREP_WITH_VOIDS', Name: {value: ''}}))
        .toBe('Solid #1')
      expect(geometryItemLabel(2, {type: 'SHELL_BASED_SURFACE_MODEL', Name: {value: ''}}))
        .toBe('Shell #2')
    })

    it('degrades to Item for unknown types, null items, and typeless items', () => {
      // A typeless item is what a pre-1.387 Conway returns; null is a failed
      // lookup — the express id itself stays the identity either way.
      expect(geometryItemLabel(7, {type: 'AXIS2_PLACEMENT_3D', Name: {value: ''}}))
        .toBe('Item #7')
      expect(geometryItemLabel(8, null)).toBe('Item #8')
      expect(geometryItemLabel(9, {Name: {value: ''}})).toBe('Item #9')
    })
  })

  describe('labelForGeometryId', () => {
    it('resolves through the model\'s uniform properties surface', async () => {
      // The one-arg `model.getItemProperties(expressID)` contract — live
      // Conway parse and cache-hit GLB expose the same shape.
      const model = {getItemProperties: jest.fn().mockResolvedValue(
        {expressID: NEMA_FACE_ID, type: 'ADVANCED_FACE', Name: {value: 'NONE'}})}
      await expect(labelForGeometryId(model, NEMA_FACE_ID)).resolves.toBe('Face #29')
      expect(model.getItemProperties).toHaveBeenCalledWith(NEMA_FACE_ID)
    })

    it('resolves a sync (cache-hit table) surface too', async () => {
      const model = {getItemProperties: (expressID) =>
        ({expressID, type: 'MANIFOLD_SOLID_BREP', Name: {value: ''}})}
      await expect(labelForGeometryId(model, SOLID_ID)).resolves.toBe('Solid #250')
    })

    it('degrades gracefully when the surface is absent, empty, or throws', async () => {
      await expect(labelForGeometryId(null, 5)).resolves.toBe('Item #5')
      const throwing = {getItemProperties: jest.fn().mockRejectedValue(
        new Error('boom'))}
      await expect(labelForGeometryId(throwing, 6)).resolves.toBe('Item #6')
      // A cache-hit table without this id returns undefined.
      const missing = {getItemProperties: () => undefined}
      await expect(labelForGeometryId(missing, 7)).resolves.toBe('Item #7')
    })
  })
})
