/**
 * The GLTFLoader that opens every `.glb` / `.gltf` — cache hits AND files
 * the user brings — must carry both codecs' decoders whatever the cache
 * WRITER's flags say. With the decoders gated on `glbDraco` /
 * `glbMeshopt` (both default off), a Share export compressed from the
 * Export tab (#1842) failed to open in Share itself: "setMeshoptDecoder must
 * be called before loading compressed files" and "No DRACOLoader instance
 * provided" (#1837 deploy-preview smoke).
 */
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {isFeatureEnabled} from '../FeatureFlags'
import {newGltfLoader} from './Loader'


jest.mock('../FeatureFlags', () => ({
  ...jest.requireActual('../FeatureFlags'),
  isFeatureEnabled: jest.fn(),
}))


describe('Loader#newGltfLoader', () => {
  it('carries the DRACO and Meshopt decoders with both compression flags off', () => {
    isFeatureEnabled.mockReturnValue(false)

    const loader = newGltfLoader()

    expect(loader.dracoLoader).toBeInstanceOf(DRACOLoader)
    // The same path the viewer's DRACOLoader has always read from
    // (`public/static/js/draco/`), so the wasm is fetched from this origin.
    // r187 replaced `decoderPath` with per-file `decoderPaths`, defaulting
    // to a CDN; setDecoderPath must still point them all at this origin.
    expect(loader.dracoLoader.decoderPaths).toEqual({
      js: '/static/js/draco/draco_wasm_wrapper.js',
      wasm: '/static/js/draco/draco_decoder.wasm',
      dep_js: '/static/js/draco/draco_decoder.js',
    })
    // The wasm decoder, the r187 default (`type: 'js'` is the only opt-out).
    expect(loader.dracoLoader.decoderConfig.type).not.toBe('js')
    expect(loader.meshoptDecoder).toBe(MeshoptDecoder)
  })

  it('shares one DRACOLoader across GLTFLoaders', () => {
    // A GLTFLoader is made per load, and a DRACOLoader that has decoded
    // owns a worker pool nothing disposes — one per page, not per load.
    isFeatureEnabled.mockReturnValue(false)

    const first = newGltfLoader()
    const second = newGltfLoader()

    expect(first).not.toBe(second)
    expect(second.dracoLoader).toBe(first.dracoLoader)
  })
})
