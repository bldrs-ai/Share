// Throwaway spike (open-205 §9.1, design/new/offscreen-rendering.md §5): one
// large BatchedMesh scene, built identically on the main thread and in the
// render worker, with Share's three. Not product code; see README.md.
import {
  AmbientLight, BatchedMesh, BoxGeometry, Color, CylinderGeometry, DirectionalLight,
  Euler, Matrix4, MeshLambertMaterial, PerspectiveCamera, Quaternion, Scene,
  SphereGeometry, Vector3, WebGLRenderer,
} from 'three'


/**
 * @param {number} seed
 * @return {Function} a seeded uniform [0, 1) generator, so both threads
 *   build the same scene
 */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = ((s * 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}


/**
 * Build the scene on `canvas` (an HTMLCanvasElement or an OffscreenCanvas).
 *
 * Pacing, because §5 found a worker's rAF is not back-pressured by a slow GPU
 * the way main's is (frames queued, then the worker blocked for 2–8 s):
 * - `fence2` (default): at most two frames in flight, each with a WebGL2
 *   fence. A tick draws only if fewer than two frames are still unfinished;
 *   otherwise it is skipped. One frame in flight (`fence`) capped every run at
 *   half the display rate on a real GPU (an M2, 2026-11-09): a frame's fence
 *   had not signalled by the next rAF, because the browser presents it
 *   asynchronously, so every other tick was skipped even when idle.
 * - `fence`: at most one frame in flight (§3.3's original rule).
 * - `finish`: `gl.finish()` after each frame (what the container spike did;
 *   on a real GPU it serialises CPU and GPU, so it is pessimistic).
 * - `none`: draw on every tick, as Share does today.
 *
 * Fence pacing reports a frame "done" at the first tick that sees its fence
 * signalled (up to a frame late, equally on both threads). Without a fence,
 * the draw's end stands in.
 *
 * @param {object} canvas
 * @param {object} opts
 * @param {number} opts.width drawing-buffer width in device pixels
 * @param {number} opts.height drawing-buffer height in device pixels
 * @param {number} opts.instances
 * @param {boolean} [opts.cull] camera inside the grid with a short far plane
 * @param {boolean} [opts.heavy] MSAA, log depth and denser geometry
 * @param {string} [opts.pace] 'fence2' | 'fence' | 'finish' | 'none'
 * @param {object} [opts.renderer] draw with this renderer instead of making one on `canvas`
 * @return {object} `{tris, renderer, gpu, setInput(x), tick(now)}`
 */
export function makeScene(canvas, opts) {
  const {width, height, instances} = opts
  const heavy = opts.heavy === true
  const cull = opts.cull === true
  const pace = opts.pace ?? 'fence2'
  const maxInFlight = {fence2: 2, fence: 1}[pace] ?? 0
  // `opts.renderer`: several scenes sharing one context (the "one render
  // worker, many scenes" option of the many-views test in main.js).
  const renderer = opts.renderer ?? new WebGLRenderer({canvas, antialias: heavy, logarithmicDepthBuffer: heavy})
  if (!opts.renderer) {
    renderer.setPixelRatio(1)
    // updateStyle=false: an OffscreenCanvas has no `style` (§3.4).
    renderer.setSize(width, height, false)
  }
  const gl = renderer.getContext()
  const scene = new Scene()
  scene.background = new Color(0xa9a9a9)
  scene.add(new AmbientLight(0xffffff, 0.8))
  const light = new DirectionalLight(0xffffff, 2)
  light.position.set(1, 1, 1)
  scene.add(light)
  const geoms = heavy ?
    [new BoxGeometry(1, 1, 1, 4, 4, 4), new SphereGeometry(0.6, 24, 16), new CylinderGeometry(0.4, 0.4, 1.5, 24, 4)] :
    [new BoxGeometry(1, 1, 1), new SphereGeometry(0.6, 6, 4), new CylinderGeometry(0.4, 0.4, 1.5, 6, 1)]
  let maxV = 0
  let maxI = 0
  for (const g of geoms) {
    maxV += g.attributes.position.count
    maxI += g.index.count
  }
  const mesh = new BatchedMesh(instances, maxV, maxI, new MeshLambertMaterial())
  const ids = geoms.map((g) => mesh.addGeometry(g))
  const r = rng(opts.seed ?? 42)
  const m = new Matrix4()
  const q = new Quaternion()
  const c = new Color()
  const one = new Vector3(1, 1, 1)
  const side = Math.ceil(Math.cbrt(instances))
  for (let i = 0; i < instances; i++) {
    const inst = mesh.addInstance(ids[i % ids.length])
    const p = new Vector3(
      (i % side) - (side / 2), (Math.floor(i / side) % side) - (side / 2), Math.floor(i / (side * side)) - (side / 2),
    ).multiplyScalar(2)
    q.setFromEuler(new Euler(r() * 6, r() * 6, r() * 6))
    m.compose(p, q, one)
    mesh.setMatrixAt(inst, m)
    mesh.setColorAt(inst, c.setHSL(r(), 0.6, 0.5))
  }
  scene.add(mesh)
  // `cull`: every instance is still frustum-tested on the CPU each frame
  // (perObjectFrustumCulled, three's default, as Share leaves it) but only a
  // few hundred reach the rasterizer, so the frame costs the render THREAD.
  const camera = new PerspectiveCamera(45, width / height, 0.1, cull ? 24 : 2000)
  let tris = 0
  geoms.forEach((g, k) => {
    tris += (g.index.count / 3) * Math.ceil((instances - k) / geoms.length)
  })
  const radius = cull ? side * 0.4 : side * 2.6
  let azimuth = 0
  // Unfinished frames, oldest first: their fences.
  const inFlight = []

  const draw = (now) => {
    const a = azimuth + (now * 0.0002)
    camera.position.set(Math.cos(a) * radius, radius * 0.5, Math.sin(a) * radius)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
    if (pace === 'finish') {
      gl.finish()
    } else if (maxInFlight > 0) {
      inFlight.push(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0))
      gl.flush()
    }
  }

  return {
    tris,
    renderer,
    gpu: rendererName(gl),
    setInput(x) {
      azimuth = x * Math.PI * 2
    },
    /**
     * One rAF tick.
     *
     * @param {number} now the tick's timestamp
     * @return {object} `{drawn, busy, completed, drawEnd}`. `completed` is
     *   how many earlier frames this tick found finished, oldest first (fence
     *   pacing; they finished by `now`). `drawEnd` is when this tick's draw
     *   returned, or null if it was skipped.
     */
    tick(now) {
      let completed = 0
      while (inFlight.length > 0 && gl.clientWaitSync(inFlight[0], 0, 0) !== gl.TIMEOUT_EXPIRED) {
        gl.deleteSync(inFlight.shift())
        completed++
      }
      if (maxInFlight > 0 && inFlight.length >= maxInFlight) {
        return {drawn: false, busy: 0, completed, drawEnd: null}
      }
      const t0 = performance.now()
      draw(now)
      const t1 = performance.now()
      return {drawn: true, busy: t1 - t0, completed, drawEnd: t1}
    },
    /** @return {boolean} whether frames finish later than their draw (fence pacing) */
    get fenced() {
      return maxInFlight > 0
    },
  }
}


/**
 * @param {object} gl
 * @return {string} the GPU's name, best-effort
 */
function rendererName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  } catch (e) {
    return ''
  }
}
