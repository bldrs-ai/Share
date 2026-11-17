/* eslint-disable no-magic-numbers */
// The NRRD fixup: where the volume lands in the scene, how it's windowed,
// and what the texture holds — over the phantom series stacked by
// `dicom.js` and parsed by three's own NRRDLoader, as `Loader` does.
import fs from 'fs'
import path from 'path'
import {Box3, Data3DTexture, Group, Mesh, Plane, Vector3, Vector4} from 'three'
import {NRRDLoader} from 'three/examples/jsm/loaders/NRRDLoader.js'
import {unzipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {dicomSeriesToNrrd, groupSeries, parseDicomSlice} from './dicom'
import nrrdToThree, {histogramRamp, isVolumeModel} from './nrrd'


/** @return {object} the phantom as NRRDLoader's Volume */
function phantomVolume() {
  const zip = fs.readFileSync(path.join(__dirname, '../../testdata/models/dicom/phantom-ct.zip'))
  const slices = Object.entries(unzipSync(new Uint8Array(zip)))
    .filter(([p]) => !p.endsWith('.txt'))
    .map(([, bytes]) => parseDicomSlice(bytes))
  const nrrd = dicomSeriesToNrrd(groupSeries(slices)[0])
  return new NRRDLoader().parse(nrrd.buffer)
}


describe('loader/nrrd', () => {
  it('builds one named volume mesh with the voxels in an 8-bit 3D texture', () => {
    const root = nrrdToThree(phantomVolume())
    expect(root.children).toHaveLength(1)
    const [mesh] = root.children
    expect(mesh.name).toBe('CT 40 × 48 × 32')
    expect(root.name).toBe('CT 40 × 48 × 32')
    const texture = mesh.material.uniforms.map.value
    expect(texture).toBeInstanceOf(Data3DTexture)
    expect([texture.image.width, texture.image.height, texture.image.depth]).toEqual([40, 48, 32])
    // CT window [-1024, 3071] HU: air (-1000) near 0, the 2500 HU sphere at
    // (2500 + 1024) / 4095 of 255.
    const at = (x, y, z) => texture.image.data[x + (y * 40) + (z * 40 * 48)]
    expect(at(0, 0, 0)).toBe(Math.trunc((24 / 4095) * 255))
    expect(at(25, 23, 15)).toBe(Math.trunc((3524 / 4095) * 255))
    // The opacity ramp, also from the CT window: 150 to 900 HU.
    const [start, end] = mesh.material.uniforms.ramp.value
    expect(start).toBeCloseTo(1174 / 4095)
    expect(end).toBeCloseTo(1924 / 4095)
  })

  it('places the volume where the scanner did, in metres, superior up', () => {
    const root = nrrdToThree(phantomVolume())
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    // LPS extents, voxel edges included: x from -100 - 0.35 over 40 × 0.7,
    // y from -80 - 0.4 over 48 × 0.8, z from 50 - 1.25 over 32 × 2.5.
    // Scene: x = L, y = S (up), z = -P (anterior toward the camera).
    expect(box.min.x).toBeCloseTo(-0.10035, 5)
    expect(box.max.x).toBeCloseTo(-0.10035 + 0.028, 5)
    expect(box.min.y).toBeCloseTo(0.04875, 5)
    expect(box.max.y).toBeCloseTo(0.04875 + 0.08, 5)
    expect(box.max.z).toBeCloseTo(0.0804, 5)
    expect(box.min.z).toBeCloseTo(0.0804 - 0.0384, 5)
  })

  it('maps texture axes onto patient axes: the sphere\'s +column offset is to the viewer\'s right', () => {
    const root = nrrdToThree(phantomVolume())
    root.updateMatrixWorld(true)
    const [mesh] = root.children
    // Box coords are texture coords - 0.5, and the shader's `sceneToBox`
    // takes the scene there; its inverse brings a voxel out. Voxel
    // (25.5, 23.5, 15.5) is the sphere's centre in the phantom.
    const boxToScene = mesh.material.uniforms.sceneToBox.value.clone().invert()
    const sphere = new Vector3((26 / 40) - 0.5, (24 / 48) - 0.5, (16 / 32) - 0.5).applyMatrix4(boxToScene)
    const middle = new Vector3(0, 0, 0).applyMatrix4(boxToScene)
    // Six columns of 0.7 mm along +L, which is the scene's +x; centred in
    // the other two axes.
    expect(sphere.x - middle.x).toBeCloseTo(0.0042, 6)
    expect(sphere.y - middle.y).toBeCloseTo(0, 6)
    expect(sphere.z - middle.z).toBeCloseTo(0, 6)
  })

  it('resamples a volume past the texture limit, keeping its extent', () => {
    const volume = {
      data: new Int16Array(4 * 4 * 1030),
      dimensions: [4, 4, 1030],
      windowLow: 0,
      windowHigh: 1,
      header: {vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], space_origin: ['0', '0', '0']},
    }
    const root = nrrdToThree(volume)
    root.updateMatrixWorld(true)
    const texture = root.children[0].material.uniforms.map.value
    expect(texture.image.depth).toBe(512)
    const size = new Box3().setFromObject(root).getSize(new Vector3())
    expect(size.y).toBeCloseTo(1.03, 5)
  })

  it('windows a volume of unknown modality by its own histogram', () => {
    const voxels = new Uint8Array(1000)
    voxels.fill(10, 0, 800)
    voxels.fill(200, 800)
    const [start, end] = histogramRamp(voxels)
    // Otsu splits the two populations; the ramp ends at the bright one.
    expect(start * 255).toBeGreaterThanOrEqual(10)
    expect(start * 255).toBeLessThan(200)
    expect(end * 255).toBe(200)
  })

  describe('cut planes', () => {
    /**
     * Run the volume's pre-draw hook, as the renderer would.
     *
     * @param {object} mesh
     * @return {Array<Vector4>} the box-space planes the shader gets
     */
    function drawn(mesh) {
      mesh.onBeforeRender()
      const {clipPlanes, clipCount} = mesh.material.uniforms
      return clipPlanes.value.slice(0, clipCount.value)
    }

    /**
     * @param {Vector4} plane box-space (n, c)
     * @param {Array<number>} p a box-space point
     * @return {boolean} whether the shader keeps it
     */
    const keeps = (plane, p) => (plane.x * p[0]) + (plane.y * p[1]) + (plane.z * p[2]) + plane.w >= 0

    it('hands MeshClipper\'s world-space planes to the shader in box space, kept side and all', () => {
      const root = nrrdToThree(phantomVolume())
      // Wherever Share puts the model, the planes follow it.
      root.position.set(1, 2, 3)
      root.updateMatrixWorld(true)
      const [mesh] = root.children
      expect(drawn(mesh)).toEqual([])
      const center = new Box3().setFromObject(root).getCenter(new Vector3())
      // Keep the scene's -x half (three: kept where distanceToPoint >= 0),
      // and the half below a plane raised a quarter of the box's height.
      const height = new Box3().setFromObject(root).getSize(new Vector3()).y
      mesh.material.clippingPlanes = [
        new Plane().setFromNormalAndCoplanarPoint(new Vector3(-1, 0, 0), center),
        new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, -1, 0), center.clone().add(new Vector3(0, height / 4, 0))),
      ]
      const [xCut, yCut] = drawn(mesh)
      // Scene x is the box's i axis; scene y (superior) its k axis.
      expect(keeps(xCut, [-0.25, 0, 0])).toBe(true)
      expect(keeps(xCut, [0.25, 0, 0])).toBe(false)
      expect(keeps(yCut, [0, 0, 0.2])).toBe(true)
      expect(keeps(yCut, [0, 0, 0.3])).toBe(false)
      // Planes removed: the shader cuts nothing.
      mesh.material.clippingPlanes = null
      expect(drawn(mesh)).toEqual([])
    })
  })

  it('can\'t be picked, and says it is a volume', () => {
    const root = nrrdToThree(phantomVolume())
    const hits = []
    root.children[0].raycast(null, hits)
    expect(hits).toEqual([])
    expect(isVolumeModel(root)).toBe(true)
    expect(isVolumeModel(new Group().add(new Mesh()))).toBe(false)
    expect(isVolumeModel(null)).toBe(false)
  })
})
