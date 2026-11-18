/* eslint-disable no-magic-numbers */
import {Group, Mesh} from 'three'
import {
  VOLUME_DEFAULT,
  effectiveWindow,
  isDefaultVolume,
  setVolumeMode,
  volumeOf,
  volumeOrDefault,
} from './volumeMode'


/**
 * A volume as nrrd.js builds one, as far as this module reads it: a CT packed
 * into the texture over [-1024, 3071] HU, opening at 150–900 HU.
 *
 * @return {Group}
 */
function ctVolume() {
  const mesh = new Mesh()
  mesh.material = {uniforms: {ramp: {value: [0, 1]}, opacity: {value: 1}}}
  mesh.userData = {isVolume: true, volume: {range: [-1024, 3071], defaultWindow: [150, 900], unit: 'HU'}}
  return new Group().add(mesh)
}


describe('viewer/display/volumeMode', () => {
  it('fills in and clamps an axis value', () => {
    expect(volumeOrDefault(undefined)).toEqual({...VOLUME_DEFAULT})
    expect(volumeOrDefault({window: [5, 1], opacity: 500})).toEqual({window: null, opacity: 200})
    expect(volumeOrDefault({window: [1, 5], opacity: -3})).toEqual({window: [1, 5], opacity: 0})
    expect(isDefaultVolume({window: null, opacity: 100})).toBe(true)
    expect(isDefaultVolume({window: [1, 5]})).toBe(false)
  })

  it('finds a volume, and nothing in a model that isn\'t one', () => {
    const model = ctVolume()
    expect(volumeOf(model).info.unit).toBe('HU')
    expect(volumeOf(new Group().add(new Mesh()))).toBeNull()
    expect(effectiveWindow(model, {window: null})).toEqual([150, 900])
    expect(effectiveWindow(model, {window: [0, 400]})).toEqual([0, 400])
  })

  it('sets the shader\'s ramp from a window in HU, through the packing range', () => {
    const model = ctVolume()
    const {uniforms} = volumeOf(model).mesh.material
    setVolumeMode(model, {window: [-1024 + 819, 3071 - 819], opacity: 50})
    expect(uniforms.ramp.value[0]).toBeCloseTo(0.2)
    expect(uniforms.ramp.value[1]).toBeCloseTo(0.8)
    expect(uniforms.opacity.value).toBe(0.5)
    // The default: the volume's own window, full density.
    setVolumeMode(model, VOLUME_DEFAULT)
    expect(uniforms.ramp.value[0]).toBeCloseTo((150 + 1024) / 4095)
    expect(uniforms.ramp.value[1]).toBeCloseTo((900 + 1024) / 4095)
    expect(uniforms.opacity.value).toBe(1)
  })

  it('keeps the ramp\'s edges apart, and inside the texture\'s range', () => {
    const model = ctVolume()
    const {uniforms} = volumeOf(model).mesh.material
    // Past the top of the range: both ends clamp, then part by one 8-bit step.
    setVolumeMode(model, {window: [5000, 6000], opacity: 100})
    expect(uniforms.ramp.value).toEqual([1 - (1 / 255), 1])
    setVolumeMode(model, {window: [100, 100.0001], opacity: 100})
    expect(uniforms.ramp.value[1] - uniforms.ramp.value[0]).toBeCloseTo(1 / 255)
  })

  it('leaves a model that isn\'t a volume alone', () => {
    expect(() => setVolumeMode(new Group(), {window: [1, 2], opacity: 50})).not.toThrow()
  })
})
