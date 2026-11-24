// NRRD volume → a ray-marched 3D texture in the scene.
//
// three's NRRDLoader returns a `Volume` (voxels plus the header's geometry),
// not an Object3D. This fixup turns it into one: the voxels, windowed to
// 8 bits, go into a `Data3DTexture`, and a box placed where the scanner put
// the volume ray-marches through it in its fragment shader. A DICOM series
// reaches here as the NRRD `loader/dicom.js` stacked it into, so a CT is in
// Hounsfield units and gets a bone-and-tissue window; any other volume is
// windowed by its own histogram.
//
// Why 8 bits: a normalized 8-bit texture is linearly filterable on every
// WebGL2 device, while 16-bit normalized needs EXT_texture_norm16 and float
// costs four times the memory. Windowing first keeps the contrast that
// matters; the step is ~16 HU across CT's range.
//
// Design: design/new/adding-model-formats.md §"A DICOM series becomes one
// NRRD".
import {
  BackSide,
  BoxGeometry,
  Data3DTexture,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  Plane,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
} from 'three'


// Voxel arithmetic (8-bit range, half-voxel centers, histogram bins) reads
// clearer as literals than as a constant per 255 and 0.5.
/* eslint-disable no-magic-numbers */
// The largest edge the texture gets. WebGL2 guarantees a 256 3D-texture
// edge and desktop and mobile GPUs give 2048, but memory is the real limit:
// at 512 a whole-body CT's 512×512×1200 is resampled to 512×512×512, 128 MiB
// of texture, rather than 300 MiB.
const MAX_TEXTURE_EDGE = 512

// NRRD's patient spaces are in millimetres; the scene is in metres.
const MM_TO_M = 0.001

// Patient LPS (x to the patient's Left, y Posterior, z Superior) to the
// scene's Y-up: superior is up, and the patient faces +Z, toward the
// default camera, so the patient's left is on the viewer's right. A
// rotation (determinant 1), so the volume is never mirrored.
const LPS_TO_SCENE = new Matrix4().set(
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
)

// Hounsfield window for a CT: opacity ramps up from fat/soft tissue to
// cortical bone, so bone reads as the surface with tissue a faint shell.
const CT_WINDOW_HU = [-1024, 3071]
const CT_RAMP_HU = [150, 900]


/**
 * NRRDLoader's parse result, as far as this module reads it.
 *
 * @typedef {object} NrrdVolume
 * @property {Array<number>|Int16Array|Uint8Array|Uint16Array|Int8Array} data voxels, x fastest
 * @property {Array<number>} dimensions [x, y, z] voxel counts
 * @property {number} windowLow min voxel value
 * @property {number} windowHigh max voxel value
 * @property {object} header the NRRD header fields (`vectors`, `space`,
 *   `space_origin`, key/value pairs)
 */


/**
 * Build the scene object for a parsed NRRD volume.
 *
 * @param {NrrdVolume} volume
 * @return {Group} a Group holding one volume Mesh, named for the NavTree
 */
export default function nrrdToThree(volume) {
  const modality = keyValue(volume.header, 'modality')
  const isCt = modality === 'CT'
  const window = isCt ? CT_WINDOW_HU : [volume.windowLow, volume.windowHigh]
  const {texture, size} = volumeTexture(volume, window)
  const ramp = isCt ?
    CT_RAMP_HU.map((hu) => normalizeIn(hu, window)) :
    histogramRamp(texture.image.data)

  const material = new ShaderMaterial({
    uniforms: {
      map: {value: texture},
      ramp: {value: ramp},
      // The Display menu's opacity (viewer/display/volumeMode.js): a
      // multiplier on the density below, 1 as loaded.
      opacity: {value: 1},
      steps: {value: Math.min(768, Math.ceil(Math.hypot(...size) * 1.5))},
      // Cut planes, in box space, refreshed before each draw
      // (`syncClipPlanes`).
      clipPlanes: {value: Array.from({length: MAX_CLIP_PLANES}, () => new Vector4())},
      clipCount: {value: 0},
    },
    vertexShader: VOLUME_VERTEX_SHADER,
    fragmentShader: VOLUME_FRAGMENT_SHADER,
    // Back faces, so the volume still draws with the camera inside it; the
    // ray starts at the camera then (`max(bounds.x, 0)` in the shader).
    side: BackSide,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
  })
  // The box is the unit cube [-0.5, 0.5]³ — which the shader maps to
  // texture [0, 1]³ — with its placement baked into the vertices, and the
  // inverse handed to the shader to get back. Baked, not on the Mesh's
  // transform, because `Loader#readModel` hoists the first child's geometry
  // onto a geometry-less root, and a unit cube there would put a 1 m box at
  // the origin into every bounds Share takes of the model (fit to frame).
  const boxToScene = placement(volume)
  const geometry = new BoxGeometry(1, 1, 1).applyMatrix4(boxToScene)
  material.uniforms.sceneToBox = {value: boxToScene.clone().invert()}
  const mesh = new Mesh(geometry, material)
  const [nx, ny, nz] = volume.dimensions
  const label = `${modality || 'Volume'} ${nx} × ${ny} × ${nz}`
  mesh.name = label
  mesh.userData.isVolume = true
  // For the Display menu's Volume section (viewer/display/volumeMode.js),
  // which works in the volume's own units: the window the voxels were packed
  // into the 8-bit texture with, the ramp it opens at, and the unit's name.
  mesh.userData.volume = {
    range: [window[0], window[1]],
    defaultWindow: ramp.map((t) => window[0] + (t * (window[1] - window[0]))),
    unit: isCt ? 'HU' : '',
  }
  // Not pickable: a click on the volume has nothing to select (no
  // elements, no properties), and selecting the box only outlined it.
  // CadView turns the Properties panel off for a volume as well
  // (`isVolumeModel`).
  mesh.raycast = () => undefined
  mesh.onBeforeRender = () => syncClipPlanes(mesh, boxToScene)

  const root = new Group()
  root.name = label
  root.add(mesh)
  return root
}


/**
 * Whether a loaded model is a volume from this module, for the UI to turn
 * off what a volume can't use (the Properties panel).
 *
 * @param {object} model the loaded model root
 * @return {boolean}
 */
export function isVolumeModel(model) {
  let found = false
  model?.traverse?.((node) => {
    if (node.userData?.isVolume) {
      found = true
    }
  })
  return found
}


/**
 * Hand the cut planes to the shader, in box space.
 *
 * `MeshClipper` binds its planes (world space, one stable array) to every
 * material's `clippingPlanes`. three's own clipping would discard the box's
 * back faces, which isn't a cut through the volume, so this shader doesn't
 * include three's clipping chunks: it trims each ray to the part every plane
 * keeps instead, so a cut shows the scan's inside. Run before every draw, so
 * a plane's drag (moved in place, with a paint requested) and the model's
 * own transform are both current.
 *
 * Kept, as in three, where `plane.distanceToPoint(p) >= 0` for every plane
 * (`clipIntersection` false, which `MeshClipper` sets).
 *
 * @param {Mesh} mesh the volume
 * @param {Matrix4} boxToScene the placement baked into its vertices
 */
export function syncClipPlanes(mesh, boxToScene) {
  const {uniforms} = mesh.material
  const planes = mesh.material.clippingPlanes ?? []
  const count = Math.min(planes.length, MAX_CLIP_PLANES)
  if (count > 0) {
    scratchWorldToBox.multiplyMatrices(mesh.matrixWorld, boxToScene).invert()
    for (let i = 0; i < count; i++) {
      scratchPlane.copy(planes[i]).applyMatrix4(scratchWorldToBox)
      uniforms.clipPlanes.value[i].set(
        scratchPlane.normal.x, scratchPlane.normal.y, scratchPlane.normal.z, scratchPlane.constant)
    }
  }
  uniforms.clipCount.value = count
}


// The most cut planes the shader reads. `MeshClipper` makes one per axis
// direction the user adds, so six covers a full box cut.
const MAX_CLIP_PLANES = 6
const scratchWorldToBox = new Matrix4()
const scratchPlane = new Plane()


/**
 * Where the unit box goes for the header's voxels: `space directions` are
 * the per-voxel steps along each axis (spacing included) and `space origin`
 * the CENTER of the first voxel, so the box's corner sits half a voxel
 * before it. Then millimetres to metres and patient space to the scene's.
 *
 * @param {NrrdVolume} volume
 * @return {Matrix4} unit box → scene
 */
function placement(volume) {
  const {header, dimensions} = volume
  const vectors = header.vectors ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  const origin = (header.space_origin ?? [0, 0, 0]).map(Number)
  const [i, j, k] = vectors.map((v) => new Vector3(...v))
  // Columns: each axis' full extent. Translation: the box center.
  const center = new Vector3(...origin)
    .addScaledVector(i, (dimensions[0] - 1) / 2)
    .addScaledVector(j, (dimensions[1] - 1) / 2)
    .addScaledVector(k, (dimensions[2] - 1) / 2)
  const boxToSpace = new Matrix4().makeBasis(
    i.clone().multiplyScalar(dimensions[0]),
    j.clone().multiplyScalar(dimensions[1]),
    k.clone().multiplyScalar(dimensions[2]),
  ).setPosition(center)
  const spaceToScene = new Matrix4().makeScale(MM_TO_M, MM_TO_M, MM_TO_M)
    .multiply(spaceToLps(header.space))
  return LPS_TO_SCENE.clone().multiply(spaceToScene).multiply(boxToSpace)
}


/**
 * @param {string} [space] NRRD `space`
 * @return {Matrix4} that space to LPS. RAS and LAS flip axes; a volume with
 *   no space (or one we don't know) is taken as LPS, which is what DICOM
 *   writes and what `loader/dicom.js` declares.
 */
function spaceToLps(space) {
  switch (space) {
    case 'right-anterior-superior':
    case 'RAS':
      return new Matrix4().makeScale(-1, -1, 1)
    case 'left-anterior-superior':
    case 'LAS':
      return new Matrix4().makeScale(1, -1, 1)
    default:
      return new Matrix4()
  }
}


/**
 * The voxels as a normalized 8-bit texture, windowed to `[lo, hi]` and,
 * past {@link MAX_TEXTURE_EDGE} on any axis, resampled to the nearest voxel.
 *
 * @param {NrrdVolume} volume
 * @param {Array<number>} window [lo, hi] in the volume's units
 * @return {{texture: Data3DTexture, size: Array<number>}}
 */
function volumeTexture(volume, window) {
  const [nx, ny, nz] = volume.dimensions
  const size = [nx, ny, nz].map((n) => Math.min(n, MAX_TEXTURE_EDGE))
  const [sx, sy, sz] = size
  const [lo, hi] = window
  const range = hi > lo ? hi - lo : 1
  const src = volume.data
  const out = new Uint8Array(sx * sy * sz)
  for (let z = 0; z < sz; z++) {
    const srcZ = Math.floor(((z + 0.5) * nz) / sz)
    for (let y = 0; y < sy; y++) {
      const srcY = Math.floor(((y + 0.5) * ny) / sy)
      const srcRow = (srcZ * ny * nx) + (srcY * nx)
      const outRow = (z * sy * sx) + (y * sx)
      for (let x = 0; x < sx; x++) {
        const srcX = sx === nx ? x : Math.floor(((x + 0.5) * nx) / sx)
        const v = ((src[srcRow + srcX] - lo) / range) * 255
        out[outRow + x] = v < 0 ? 0 : (v > 255 ? 255 : v)
      }
    }
  }
  const texture = new Data3DTexture(out, sx, sy, sz)
  texture.format = RedFormat
  texture.type = UnsignedByteType
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return {texture, size}
}


/**
 * An opacity ramp for a volume of unknown modality: from the level that
 * splits background from object (Otsu's threshold over the histogram) up
 * to the 99th percentile, so the object's surface reads and the background
 * stays clear.
 *
 * @param {Uint8Array} voxels the normalized texture data
 * @return {Array<number>} [start, end] in [0, 1]
 */
export function histogramRamp(voxels) {
  const histogram = new Float64Array(256)
  for (let i = 0; i < voxels.length; i++) {
    histogram[voxels[i]]++
  }
  const total = voxels.length
  let sumAll = 0
  for (let b = 0; b < 256; b++) {
    sumAll += b * histogram[b]
  }
  let sumBack = 0
  let weightBack = 0
  let best = 0
  let threshold = 0
  for (let b = 0; b < 256; b++) {
    weightBack += histogram[b]
    if (weightBack === 0 || weightBack === total) {
      continue
    }
    sumBack += b * histogram[b]
    const meanBack = sumBack / weightBack
    const meanFore = (sumAll - sumBack) / (total - weightBack)
    const between = weightBack * (total - weightBack) * ((meanBack - meanFore) ** 2)
    if (between > best) {
      best = between
      threshold = b
    }
  }
  let seen = 0
  let p99 = 255
  for (let b = 0; b < 256; b++) {
    seen += histogram[b]
    if (seen >= total * 0.99) {
      p99 = b
      break
    }
  }
  const start = threshold / 255
  const end = Math.max(p99 / 255, start + (1 / 255))
  return [start, end]
}


/**
 * @param {number} value
 * @param {Array<number>} window [lo, hi]
 * @return {number} value's place in the window, [0, 1]
 */
function normalizeIn(value, [lo, hi]) {
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)))
}


/**
 * An NRRD key/value pair (`key:=value`) off NRRDLoader's header object,
 * which files it under the key with the `=` still on the value.
 *
 * @param {object} header
 * @param {string} key
 * @return {string}
 */
function keyValue(header, key) {
  const raw = header?.[key]
  return typeof raw === 'string' ? raw.replace(/^=/, '').trim() : ''
}


// The ray, in the box's own space: from the camera through this fragment,
// or for an orthographic camera along the view direction, from outside the
// box.
//
// `position` is in the geometry's (scene-placed) space; `sceneToBox` takes
// it back to the unit box. Any transform Share puts on the model or the mesh
// is `modelMatrix`, undone first.
const VOLUME_VERTEX_SHADER = /* glsl */ `
uniform mat4 sceneToBox;

varying vec3 vOrigin;
varying vec3 vDirection;

void main() {
  mat4 worldToBox = sceneToBox * inverse(modelMatrix);
  vec3 boxPosition = (sceneToBox * vec4(position, 1.0)).xyz;
  if (isOrthographic) {
    // The camera's forward axis is the third row of the view matrix, negated.
    vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vDirection = (worldToBox * vec4(forward, 0.0)).xyz;
    vOrigin = boxPosition - (normalize(vDirection) * 2.0);
  } else {
    vOrigin = (worldToBox * vec4(cameraPosition, 1.0)).xyz;
    vDirection = boxPosition - vOrigin;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`


// Front-to-back compositing through the box. Opacity ramps over `ramp`;
// each sample is lit by its gradient (a headlight, so the shape reads at
// any angle), and the ray stops once it is nearly opaque.
const VOLUME_FRAGMENT_SHADER = /* glsl */ `
uniform sampler3D map;
uniform vec2 ramp;
uniform float opacity;
uniform float steps;
uniform vec4 clipPlanes[${MAX_CLIP_PLANES}];
uniform int clipCount;

varying vec3 vOrigin;
varying vec3 vDirection;

vec2 hitBox(vec3 origin, vec3 dir) {
  vec3 inv = 1.0 / dir;
  vec3 t0 = (vec3(-0.5) - origin) * inv;
  vec3 t1 = (vec3(0.5) - origin) * inv;
  vec3 tMin = min(t0, t1);
  vec3 tMax = max(t0, t1);
  return vec2(max(max(tMin.x, tMin.y), tMin.z), min(min(tMax.x, tMax.y), tMax.z));
}

float sampleAt(vec3 p) {
  return texture(map, p + 0.5).r;
}

void main() {
  vec3 dir = normalize(vDirection);
  vec2 bounds = hitBox(vOrigin, dir);
  if (bounds.x > bounds.y) {
    discard;
  }
  bounds.x = max(bounds.x, 0.0);
  // Trim the ray to the side of each cut plane that is kept
  // (dot(n, p) + c >= 0), so a cut opens the volume at the plane.
  for (int c = 0; c < ${MAX_CLIP_PLANES}; c++) {
    if (c >= clipCount) {
      break;
    }
    vec4 plane = clipPlanes[c];
    float along = dot(plane.xyz, dir);
    float side = dot(plane.xyz, vOrigin) + plane.w;
    if (abs(along) < 1e-8) {
      if (side < 0.0) {
        discard;
      }
    } else if (along > 0.0) {
      bounds.x = max(bounds.x, -side / along);
    } else {
      bounds.y = min(bounds.y, -side / along);
    }
  }
  if (bounds.x > bounds.y) {
    discard;
  }
  float delta = 1.7321 / steps;
  // A per-pixel offset into the first step, so the steps don't line up
  // into visible rings.
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = bounds.x + (jitter * delta);
  vec3 eps = vec3(1.0 / vec3(textureSize(map, 0)));
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 2048; i++) {
    if (t > bounds.y || float(i) >= steps) {
      break;
    }
    vec3 p = vOrigin + (t * dir);
    float v = sampleAt(p);
    float a = smoothstep(ramp.x, ramp.y, v);
    if (a > 0.002) {
      vec3 g = vec3(
        sampleAt(p + vec3(eps.x, 0.0, 0.0)) - sampleAt(p - vec3(eps.x, 0.0, 0.0)),
        sampleAt(p + vec3(0.0, eps.y, 0.0)) - sampleAt(p - vec3(0.0, eps.y, 0.0)),
        sampleAt(p + vec3(0.0, 0.0, eps.z)) - sampleAt(p - vec3(0.0, 0.0, eps.z)));
      float light = 0.35;
      if (length(g) > 1e-4) {
        light += 0.65 * abs(dot(normalize(g), dir));
      }
      // Tissue warm, bone white.
      vec3 color = mix(vec3(0.85, 0.55, 0.45), vec3(1.0, 0.98, 0.94), a) * light;
      // Opacity per unit length, so the look doesn't depend on step count.
      float alpha = 1.0 - pow(1.0 - min(1.0, a * 0.6 * opacity), delta * 200.0);
      acc.rgb += (1.0 - acc.a) * alpha * color;
      acc.a += (1.0 - acc.a) * alpha;
      if (acc.a > 0.98) {
        break;
      }
    }
    t += delta;
  }
  if (acc.a < 0.01) {
    discard;
  }
  gl_FragColor = acc;
}
`
