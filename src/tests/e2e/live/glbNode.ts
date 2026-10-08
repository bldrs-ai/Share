/**
 * The two checks that stand in for §8's third-party viewers
 * (gltf-viewer.donmccurdy.com, 3dviewer.net, the three.js editor), run in
 * Node on the downloaded bytes:
 *
 * - {@link validateGlb}: Khronos' glTF-Validator, the same engine
 *   donmccurdy's viewer runs in its validation panel.
 * - {@link loadGlbInThree}: three.js' own `GLTFLoader` — the loader the
 *   donmccurdy viewer and the three.js editor are built on — with the Draco
 *   and Meshopt decoders attached, returning the node hierarchy a viewer's
 *   outline would show.
 *
 * Neither is Share's own reader, which is the point: a file Share can reopen
 * but nobody else can is the failure §8 step 5c was written for.
 *
 * Free of any Playwright import, for `glbNode.test.js`.
 * Design: design/new/live-browser-smoke.md §"What stands in for the
 * third-party viewers".
 */
import {existsSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {MeshoptDecoder} from 'meshoptimizer'
import {BufferAttribute, BufferGeometry, Mesh, Object3D} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {validateBytes} from 'gltf-validator'


export type ValidatorMessage = {code: string, message: string, severity: number, pointer?: string}
export type ValidationResult = {numErrors: number, errors: ValidatorMessage[], unsupportedExtensions: string[]}
export type ThreeLoadResult = {
  /** Every node's name with its ancestors' names, root first, e.g. ['Bldrs', 'Build', 'Every', 'Thing'] */
  paths: string[][]
  meshCount: number
  triangleCount: number
}

const VALIDATOR_SEVERITY_ERROR = 0
const TRIANGLE_VERTICES = 3


/**
 * Validate with glTF-Validator and return its errors.
 *
 * Only errors fail a spec. Warnings and infos include the validator not
 * knowing Share's own `BLDRS_*` extensions, which is expected; those names
 * come back in `unsupportedExtensions`, so a spec can still assert that the
 * metadata it expects is declared.
 *
 * @param bytes the downloaded `.glb`
 * @param ignoredIssues validator issue codes a caller has shown it must
 *   tolerate for this file's codec, each with its reason at the call site
 * @return the errors and the unsupported extension names
 */
export async function validateGlb(bytes: Uint8Array, ignoredIssues: string[] = []): Promise<ValidationResult> {
  const report = await validateBytes(bytes, {format: 'glb', maxIssues: 0, ignoredIssues})
  const messages: ValidatorMessage[] = report.issues.messages
  const unsupportedExtensions = messages
    .filter((m) => m.code === 'UNSUPPORTED_EXTENSION')
    .map((m) => (m.message.match(/'([^']+)'/) ?? [])[1])
    .filter((name): name is string => typeof name === 'string')
  return {
    numErrors: report.issues.numErrors,
    errors: messages.filter((m) => m.severity === VALIDATOR_SEVERITY_ERROR),
    unsupportedExtensions,
  }
}


/**
 * Load a `.glb` with three.js' `GLTFLoader` in Node, Draco and Meshopt
 * decoders attached, and report what a viewer would show.
 *
 * @param bytes the downloaded `.glb`
 * @return the hierarchy and how much geometry decoded
 */
export async function loadGlbInThree(bytes: Uint8Array): Promise<ThreeLoadResult> {
  const loader = new GLTFLoader()
  // GLTFLoader only calls preload() and decodeDracoFile() on its Draco
  // loader, so this stands in for DRACOLoader, whose Web Worker pool Node
  // does not have.
  loader.setDRACOLoader(new NodeDracoLoader() as unknown as Parameters<GLTFLoader['setDRACOLoader']>[0])
  loader.setMeshoptDecoder(MeshoptDecoder)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const gltf = await loader.parseAsync(buffer, '')
  const paths: string[][] = []
  let meshCount = 0
  let triangleCount = 0
  gltf.scene.traverse((object: Object3D) => {
    const path: string[] = []
    for (let node: Object3D | null = object; node !== null && node !== gltf.scene; node = node.parent) {
      path.unshift(node.name)
    }
    if (path.length > 0) {
      paths.push(path)
    }
    if ((object as Mesh).isMesh) {
      meshCount++
      const geometry = (object as Mesh).geometry
      const vertices = geometry.index ? geometry.index.count : geometry.getAttribute('position').count
      const instances = (object as unknown as {count?: number}).count ?? 1
      triangleCount += (vertices / TRIANGLE_VERTICES) * instances
    }
  })
  return {paths, meshCount, triangleCount}
}


/**
 * Whether some node sits under exactly this chain of ancestors, from the
 * scene root down.
 *
 * Names are compared as three.js shows them, which is not quite as the file
 * stores them: `GLTFLoader` sanitises names (`PropertyBinding.sanitizeNodeName`,
 * so compare names with no spaces, dots, colons or brackets) and makes them
 * unique by appending `_<n>`. A portable export's scene and its root node are
 * both "Bldrs", so the root loads as "Bldrs_1" — which the editor's outline
 * shows too, and which is still the named hierarchy §8 step 5c asks for. So a
 * trailing `_<n>` is dropped before comparing.
 *
 * @param paths from {@link loadGlbInThree}
 * @param chain names, outermost first
 * @return whether the chain is present
 */
export function hasNodeChain(paths: string[][], chain: string[]): boolean {
  const base = (name: string) => name.replace(/_\d+$/, '')
  return paths.some((path) => path.length >= chain.length &&
    chain.every((name, i) => base(path[i]) === name))
}


type DracoModule = {
  Decoder: new () => DracoDecoder
  Mesh: new () => {ptr: number, num_faces: () => number, num_points: () => number}
  TRIANGULAR_MESH: number
  DT_FLOAT32: number
  DT_INT8: number
  DT_INT16: number
  DT_INT32: number
  DT_UINT8: number
  DT_UINT16: number
  DT_UINT32: number
  HEAPF32: Float32Array
  _malloc: (n: number) => number
  _free: (ptr: number) => void
  destroy: (o: unknown) => void
}
type DracoDecoder = {
  GetEncodedGeometryType: (array: Int8Array) => number
  DecodeArrayToMesh: (array: Int8Array, length: number, mesh: unknown) => {ok: () => boolean, error_msg: () => string}
  GetAttributeByUniqueId: (mesh: unknown, id: number) => {num_components: () => number}
  GetTrianglesUInt32Array: (mesh: unknown, byteLength: number, ptr: number) => void
  GetAttributeDataArrayForAllPoints: (mesh: unknown, attribute: unknown, type: number, byteLength: number, ptr: number) => void
}
type AnyTypedArray = Float32Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array
type TypedArrayConstructor = {
  new (buffer: ArrayBufferLike, byteOffset: number, length: number): AnyTypedArray
  readonly BYTES_PER_ELEMENT: number
}

const TYPED_ARRAYS: Record<string, TypedArrayConstructor> = {
  Float32Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array,
}


/**
 * The slice of `DRACOLoader` that `GLTFLoader` calls, decoding in-process
 * with the pure-JS decoder three.js ships beside its loaders. It follows
 * `DRACOLoader.js`'s worker (`decodeGeometry` / `decodeAttribute`) for the
 * glTF case only: a triangle mesh whose attributes are addressed by unique
 * id. Attributes come back non-interleaved — padding to a 4-byte stride
 * matters to a GPU upload, not to a load check.
 */
class NodeDracoLoader {
  private module: Promise<DracoModule> | null = null

  /**
   * Load the decoder; GLTFLoader calls this when it sees the extension.
   *
   * @return this, as DRACOLoader returns
   */
  preload() {
    if (this.module === null) {
      this.module = loadDracoModule()
    }
    return this
  }

  /**
   * @param buffer the primitive's compressed bufferView
   * @param callback receives the decoded geometry
   * @param attributeIDs three.js attribute name → Draco unique id
   * @param attributeTypes three.js attribute name → typed array name
   * @param colorSpace ignored: color space is a renderer concern
   * @param onError receives a decode failure
   * @return settles once the callback or onError has run
   */
  decodeDracoFile(
    buffer: ArrayBuffer,
    callback: (geometry: BufferGeometry) => void,
    attributeIDs: Record<string, number>,
    attributeTypes: Record<string, string>,
    colorSpace: unknown,
    onError: (err: unknown) => void,
  ) {
    this.preload()
    return (this.module as Promise<DracoModule>).then((draco) => {
      const decoder = new draco.Decoder()
      try {
        callback(decodeMesh(draco, decoder, new Int8Array(buffer), attributeIDs, attributeTypes))
      } finally {
        draco.destroy(decoder)
      }
    }).catch(onError)
  }
}


/* eslint-disable new-cap -- Draco's Emscripten API is PascalCase methods, not constructors */
/**
 * @param draco the decoder module
 * @param decoder a Draco decoder
 * @param array the compressed bytes
 * @param attributeIDs three.js name → unique id
 * @param attributeTypes three.js name → typed array name
 * @return the decoded geometry
 */
function decodeMesh(
  draco: DracoModule, decoder: DracoDecoder, array: Int8Array,
  attributeIDs: Record<string, number>, attributeTypes: Record<string, string>,
): BufferGeometry {
  if (decoder.GetEncodedGeometryType(array) !== draco.TRIANGULAR_MESH) {
    throw new Error('Draco: a glTF primitive must decode to a triangle mesh')
  }
  const mesh = new draco.Mesh()
  try {
    const status = decoder.DecodeArrayToMesh(array, array.byteLength, mesh)
    if (!status.ok() || mesh.ptr === 0) {
      throw new Error(`Draco: decoding failed: ${status.error_msg()}`)
    }
    const geometry = new BufferGeometry()
    for (const [name, id] of Object.entries(attributeIDs)) {
      const Typed = TYPED_ARRAYS[attributeTypes[name]]
      if (Typed === undefined) {
        throw new Error(`Draco: attribute ${name} has unsupported type ${attributeTypes[name]}`)
      }
      const attribute = decoder.GetAttributeByUniqueId(mesh, id)
      const itemSize = attribute.num_components()
      const count = mesh.num_points() * itemSize
      const byteLength = count * Typed.BYTES_PER_ELEMENT
      const ptr = draco._malloc(byteLength)
      decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, dracoDataType(draco, Typed), byteLength, ptr)
      const values = new Typed(draco.HEAPF32.buffer, ptr, count).slice()
      draco._free(ptr)
      geometry.setAttribute(name, new BufferAttribute(values, itemSize))
    }
    const indexCount = mesh.num_faces() * TRIANGLE_VERTICES
    const indexBytes = indexCount * Uint32Array.BYTES_PER_ELEMENT
    const ptr = draco._malloc(indexBytes)
    decoder.GetTrianglesUInt32Array(mesh, indexBytes, ptr)
    geometry.setIndex(new BufferAttribute(new Uint32Array(draco.HEAPF32.buffer, ptr, indexCount).slice(), 1))
    draco._free(ptr)
    return geometry
  } finally {
    draco.destroy(mesh)
  }
}
/* eslint-enable new-cap */


/**
 * @param draco the decoder module
 * @param Typed a typed array constructor
 * @return Draco's data-type enum for it
 */
function dracoDataType(draco: DracoModule, Typed: TypedArrayConstructor): number {
  const types = new Map<TypedArrayConstructor, number>([
    [Float32Array, draco.DT_FLOAT32], [Int8Array, draco.DT_INT8], [Int16Array, draco.DT_INT16],
    [Int32Array, draco.DT_INT32], [Uint8Array, draco.DT_UINT8], [Uint16Array, draco.DT_UINT16],
    [Uint32Array, draco.DT_UINT32],
  ])
  return types.get(Typed) as number
}


/**
 * Instantiate three.js' bundled pure-JS Draco decoder in this process.
 *
 * The file is an Emscripten script, not a module: three's package is
 * `"type": "module"`, so Node would load it as ESM and its `module.exports`
 * assignment would go nowhere. It is evaluated as a function body instead,
 * with the CommonJS names it looks for supplied. `onModuleLoaded` resolves
 * a WRAPPER object, as DRACOLoader's worker does: the Emscripten module is
 * itself thenable, and resolving a promise with it directly never settles.
 *
 * @return the decoder module
 */
function loadDracoModule(): Promise<DracoModule> {
  const file = join(process.cwd(), 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'draco_decoder.js')
  if (!existsSync(file)) {
    return Promise.reject(new Error(`Draco decoder not found at ${file}`))
  }
  const source = readFileSync(file, 'utf8')
  const factory = new Function('require', '__filename', '__dirname', 'module', 'exports',
    `${source}\nreturn DracoDecoderModule;`)(createRequire(file), file, dirname(file), {exports: {}}, {})
  return new Promise((resolve) => {
    factory({onModuleLoaded: (draco: DracoModule) => resolve({draco})})
  }).then((wrapped) => (wrapped as {draco: DracoModule}).draco)
}
