import fs from 'fs'
import path from 'path'
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3} from 'three'
import RenderDemand from './renderDemand'
import CutPlaneArrowHelper from './CutPlaneArrowHelper'
import IfcHighlighter from './IfcHighlighter'
import {applySceneGraphVisibility} from './sceneGraphVisibility'
import {setShadingMode, ShadingMode} from '../display/shadingMode'


/* eslint-disable no-magic-numbers */


/**
 * Render-on-demand sources (`?feature=renderOnDemand`, story #2055).
 *
 * Between loads the viewer paints only when asked, so a change that doesn't
 * ask stays off screen: a stale frame, the worst failure render-on-demand
 * can have. renderDemandHooks.js asks for most changes on three's own
 * signals; what it can't see (a `visible` flag, a material colour, an
 * outline's selection, a light) the code that changes it must ask for with
 * `requestPaint()`.
 *
 * Two halves:
 *
 *  1. **The static guard.** Every source file that makes one of those
 *     unhooked mutations is listed below, either as asking (it must call
 *     `requestPaint` or a RenderDemand ask) or with the reason it needn't (a
 *     material set up before its mesh enters the scene, which the hooked
 *     `add` covers; a scene that isn't the viewer's). A new file with such a
 *     mutation fails here until someone has decided which it is, and an
 *     entry whose file no longer makes one fails too, so the list stays
 *     the inventory. It reads source text, so it can't tell a mutation that
 *     asks from one in the same file that doesn't: the behavioural half and
 *     the E2E (`renderOnDemand.spec.ts`) cover the main ones by running them.
 *  2. **Behaviour.** The main explicit sources, run against a session
 *     RenderDemand with the hooks NOT installed, so each test passes only
 *     through the source's own ask. Delete the ask and the test goes red.
 */


/** Mutations three gives no signal for (renderDemandHooks.js module doc). */
const UNHOOKED_MUTATION = new RegExp([
  String.raw`\.visible = `,
  String.raw`\.wireframe = `,
  String.raw`\.opacity = `,
  String.raw`\.color\.(set|copy|setHex|setRGB|setStyle)\(`,
  String.raw`\.intensity = `,
  String.raw`\.setSelection\(`,
  String.raw`\.clippingPlanes = `,
  String.raw`\.emissive\.`,
  String.raw`\.layers\.(enable|disable|set)\(`,
].join('|'))
const ASKS = /requestPaint\(|\.invalidate\w*\(|keepPainting\(/

const ASKS_FOR_PAINT = 'asks'

/**
 * Every source file under src/ with an unhooked mutation, and how it's
 * covered. Paths are relative to src/.
 */
const AUDITED = {
  'viewer/ShareViewer.js': ASKS_FOR_PAINT,
  'viewer/three/IfcHighlighter.js': ASKS_FOR_PAINT,
  'viewer/three/IfcIsolator.js': ASKS_FOR_PAINT,
  'viewer/three/sceneGraphVisibility.js': ASKS_FOR_PAINT,
  'viewer/three/MeshClipper.js': ASKS_FOR_PAINT,
  'viewer/three/CutPlaneArrowHelper.ts': ASKS_FOR_PAINT,
  'viewer/three/LightingGui.js': ASKS_FOR_PAINT,
  'viewer/display/shadingMode.js': ASKS_FOR_PAINT,
  'viewer/residency/ResidencyController.js': ASKS_FOR_PAINT,
  'Components/Markers/MarkerControl.jsx': ASKS_FOR_PAINT,
  'Infrastructure/PlaceMark.js': ASKS_FOR_PAINT,
  'Containers/CadView.jsx': 'calls ShareViewer#setSelection, which paints through IfcHighlighter',
  'Components/ViewCube/ViewCube.jsx': 'its own renderer and scene, painted by its own dirty-flag loop',
  'Components/HideToggleButton.jsx': 'a CSS icon style, not the scene',
  'viewer/three/hoverOverlay.js': 'layers and background changed for its own draw, inside a paint, and put back before it returns',
  'viewer/three/context/context.js': 'the clipping-plane array at construction; the probe reads it each frame',
  'viewer/three/context/renderer/postproduction.js': 'never activated (offscreen-rendering.md inventory #10)',
  'viewer/ifc/parsePreviewMesh.js': 'materials set up before the mesh is added, which the hooked add covers',
  'viewer/ifc/flatMeshToBufferGeometry.js': 'materials set up before the mesh is added, which the hooked add covers',
  'viewer/ifc/batchedToMergedMesh.js': 'materials set up before the mesh is added, which the hooked add covers',
  'loader/stl.js': 'material options before the mesh exists',
  'loader/adf.js': 'overlays hidden while the model is built, before it enters the scene',
}


const SRC = path.resolve(__dirname, '../..')
const SKIP_DIRS = new Set(['tests', '__mocks__', 'node_modules'])
const SOURCE_FILE = /\.(js|jsx|ts|tsx)$/
const NOT_SOURCE = /\.(test|spec)\.|fixture/


/**
 * @param {string} dir
 * @param {Array<string>} out
 * @return {Array<string>} source files under `dir`, relative to src/
 */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        sourceFiles(full, out)
      }
    } else if (SOURCE_FILE.test(entry.name) && !NOT_SOURCE.test(entry.name)) {
      out.push(path.relative(SRC, full).split(path.sep).join('/'))
    }
  }
  return out
}


/**
 * The paint asks that only redraw the hover overlay on the cached frame
 * (hoverOverlay.js). An overlay frame shows the last full paint, so an ask
 * here that also changed the scene would leave the change off screen. Every
 * other ask (`requestPaint`, `requestBackgroundPaint`, `invalidate*`,
 * `keepPainting`) is a full paint. Paths relative to src/.
 */
const OVERLAY_ONLY_ASKS = {
  'viewer/three/hoverOverlay.js': 'HoverOverlay#setHover / #clear: the hovered instances, drawn by the overlay alone',
}
// The definition and its one route into RenderDemand, which aren't callers.
const OVERLAY_ASK_DEFINITION = 'viewer/three/renderDemand.js'
const OVERLAY_ASK = /requestOverlayPaint\(|\.invalidateOverlay\(/


describe('render-on-demand sources: overlay-only asks', () => {
  const askers = sourceFiles(SRC).filter((file) => file !== OVERLAY_ASK_DEFINITION &&
    OVERLAY_ASK.test(fs.readFileSync(path.join(SRC, file), 'utf8')))

  it('finds overlay-only asks in exactly the files allowed to make them', () => {
    // A file here asks for an overlay-only paint: the next frame may redraw
    // just the hover on the cached frame, so it must change nothing else
    // the picture shows. If it does, ask with requestPaint() instead.
    expect(askers.sort()).toEqual(Object.keys(OVERLAY_ONLY_ASKS).sort())
  })

  it('keeps every other source a full paint: none of the audited askers asks for an overlay', () => {
    const overlayAskers = Object.entries(AUDITED)
      .filter(([file, how]) => how === ASKS_FOR_PAINT && !(file in OVERLAY_ONLY_ASKS))
      .filter(([file]) => OVERLAY_ASK.test(fs.readFileSync(path.join(SRC, file), 'utf8')))
      .map(([file]) => file)
    expect(overlayAskers).toEqual([])
  })
})


describe('render-on-demand sources: static guard', () => {
  const mutating = sourceFiles(SRC).filter((file) =>
    UNHOOKED_MUTATION.test(fs.readFileSync(path.join(SRC, file), 'utf8')))

  it('finds the mutations it is guarding (the scan itself works)', () => {
    expect(mutating).toContain('viewer/three/sceneGraphVisibility.js')
  })

  it('knows every file that makes a mutation three gives no signal for', () => {
    // A file here is new: make it call requestPaint() (three/renderDemand.js)
    // where it changes the picture, and list it as ASKS_FOR_PAINT; or list it
    // with the reason it needn't.
    expect(mutating.filter((file) => !(file in AUDITED))).toEqual([])
  })

  it('lists no file that no longer makes one', () => {
    expect(Object.keys(AUDITED).filter((file) => !mutating.includes(file))).toEqual([])
  })

  it('finds an ask in every file listed as asking', () => {
    const silent = Object.entries(AUDITED)
      .filter(([, how]) => how === ASKS_FOR_PAINT)
      .filter(([file]) => !ASKS.test(fs.readFileSync(path.join(SRC, file), 'utf8')))
      .map(([file]) => file)
    expect(silent).toEqual([])
  })
})


describe('render-on-demand sources: behaviour', () => {
  let clock
  let demand

  beforeEach(() => {
    clock = 10_000
    demand = new RenderDemand({now: () => clock})
    demand.startSession()
    // Paint the session's first frame, so the next one paints only if asked.
    expect(demand.shouldRender()).toBe(true)
    demand.rendered(1)
    clock += 16
    expect(demand.shouldRender()).toBe(false)
  })

  afterEach(() => {
    demand.dispose()
  })

  /** @return {boolean} whether the next frame paints */
  function nextFramePaints() {
    clock += 16
    return demand.shouldRender()
  }

  it('hiding an element of a scene-graph model (STEP, GLB) asks', () => {
    const model = new Group()
    const part = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    part.expressID = 7
    model.add(part)
    applySceneGraphVisibility(model, {hiddenIds: [7]})
    expect(part.visible).toBe(false)
    expect(nextFramePaints()).toBe(true)
  })

  it('switching to wireframe asks', () => {
    const model = new Group()
    model.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
    setShadingMode(model, ShadingMode.WIREFRAME)
    expect(nextFramePaints()).toBe(true)
  })

  it('changing the selection outline asks', () => {
    const selection = new Set()
    const postProcessor = {
      createOutlineEffect: () => ({setSelection: (meshes) => meshes.forEach((m) => selection.add(m)),
        getSelection: () => ({indexOf: () => -1, add: (m) => selection.add(m)})}),
      getComposer: {render: () => undefined},
    }
    const context = {setRenderUpdate: () => undefined, getLegacyRendererWrapper: () => ({})}
    const highlighter = new IfcHighlighter(context, postProcessor)
    highlighter.setHighlighted([new Mesh()])
    expect(nextFramePaints()).toBe(true)
    demand.rendered(1)
    expect(nextFramePaints()).toBe(false)
    highlighter.addToHighlighting(new Mesh())
    expect(nextFramePaints()).toBe(true)
  })

  it('recolouring a cut plane\'s arrow (its hover) asks', () => {
    const arrow = new CutPlaneArrowHelper(new Vector3(0, 1, 0), 0xffffff)
    arrow.setColor(0xff0000)
    expect(nextFramePaints()).toBe(true)
  })
})
