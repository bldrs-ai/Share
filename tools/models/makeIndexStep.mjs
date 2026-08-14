#!/usr/bin/env node
/**
 * Generates `public/index.step` — the STEP twin of `public/index.ifc`,
 * the Bldrs logo model the homepage loads.
 *
 * Why generate rather than hand-author: the source of truth is the IFC,
 * and the two files must stay the same object in world space. The
 * homepage IFC's block extents are transcribed once into BLOCKS below;
 * everything else (BREP topology, assembly wiring, styling) is
 * mechanical and better emitted than typed.
 *
 * ## What it emits
 *
 * AP214 (`AUTOMOTIVE_DESIGN`), the schema Conway's STEP path parses —
 * the same dialect as the NIST/gear fixtures under
 * `src/tests/fixtures/.../step/`. The model is a five-level assembly
 * mirroring the IFC's spatial story, whose node names read as a
 * sentence in the NavTree:
 *
 *   Bldrs → Build → Every → Thing → Together ×7
 *
 * The seven blocks are seven *occurrences* of just two part shapes (a
 * 30m-tall block and a 15m-tall one), placed by
 * `NEXT_ASSEMBLY_USAGE_OCCURRENCE` + `CONTEXT_DEPENDENT_SHAPE_REPRESENTATION`.
 * That's deliberate: part reuse is what distinguishes STEP from IFC
 * structurally, and it exercises Share's occurrence-keyed selection
 * (design/new/step-occurrence-selection.md) — a scalar-expressID viewer
 * highlights all four short blocks when you click one.
 *
 * ## Two notes on matching the IFC
 *
 * 1. **Units.** IFC carries the logo in metres; STEP files are
 *    millimetre by convention and every CAD kernel emits `.MILLI.`.
 *    Coordinates are scaled ×1000 so the two files still occupy the
 *    same world-space box — `#c:` permalink cameras transfer between
 *    `/share/v/p/index.ifc` and `/share/v/p/index.step`.
 *
 * 2. **One colour per block, matching what the IFC *renders*.** The IFC
 *    also carries a grey body colour, per-face, via
 *    `IfcIndexedColourMap` (face colours 1,2,2,2,2,2 — lime on the -X
 *    face). Nothing renders that today: the viewer shows the whole logo
 *    lime, from the element's `IfcSurfaceStyle`. Matching the render
 *    rather than the file is also the only option here — Conway resolves
 *    AP214 `styled_item`s per representation item
 *    (`ap214_geometry_extraction.extractStyledItem` → the whole
 *    `manifold_solid_brep`), so a per-face colour has nowhere to land.
 *
 * Usage: `node tools/models/makeIndexStep.mjs [outPath]`
 *
 * @see tools/models/README.md
 * @see design/new/step-occurrence-selection.md
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'


/** STEP files are millimetre by convention; the IFC logo is in metres. */
const MM_PER_M = 1000

/**
 * The logo blocks, transcribed from `public/index.ifc`'s
 * `IfcCartesianPointList3D`s (metres). `x`/`y`/`z` are the block's
 * minimum corner; every block is the same 10 × 11.4504 footprint and
 * differs only in height, which is what lets seven blocks share two
 * part shapes.
 *
 * **The order is load-bearing — keep it identical to the IFC's.** Conway
 * puts a model's world origin at the first geometry it emits: the open
 * derives one coordination matrix from the first placement × that
 * geometry's first vertex and reuses it for the whole model
 * (`compat/web-ifc/coordination_f64.deriveCoordinationF64`, gated on
 * `COORDINATE_TO_ORIGIN`, which Share passes — `conwayDirectIfcLoader`).
 * So a model's world position depends on which element its file happens
 * to declare first, and two files of the same object only land on top of
 * each other when they agree on that. Listing the blocks in the IFC's
 * declaration order — x=76 first, not the x=0 the eye expects — is what
 * makes `index.step` and `index.ifc` share world space, and with it the
 * `#c:` camera. Sorting this array "tidily" silently slides the STEP
 * model 76m down +X; `indexStepLogo.spec.ts` fails if it does.
 */
const BLOCKS = [
  {x: 76, y: -11.4504049888, z: 0, height: 15},
  {x: 48, y: -11.4504049888, z: 0, height: 30},
  {x: 0, y: -11.4504049888, z: 0, height: 30},
  {x: 0.00232304809423, y: -24.0980424609, z: 0, height: 15},
  {x: 24, y: -11.4504049888, z: 0, height: 30},
  {x: 47.8596390944, y: 0.973380492763, z: 0, height: 15},
  {x: 62, y: -11.4504049888, z: 0, height: 15},
]

const BLOCK_WIDTH = 10
const BLOCK_DEPTH = 11.4504049888

/** Lime, from `public/index.ifc`'s `IfcColourRgb` / `theme.palette.logo.leftFace`. */
const LIME = [0, 1, 0]

/**
 * Box corners in the part's local frame, indexed 0-7: 0-3 walk the
 * z=0 face counter-clockwise from the origin, 4-7 the z=depth face
 * directly above them. Edge and face tables below index into this.
 *
 * **`CORNERS[0]` is the other half of the alignment invariant** the
 * BLOCKS note describes, and it is easy to miss because it looks like
 * pure geometry. Conway anchors a model at `placement x
 * geometry.getPoint(0)` — the first *tessellated vertex* of the first
 * placed geometry — which is local `(0,0,0)` only because `CORNERS[0]`
 * is the minimum corner and `FACES[0]`'s loop starts there. Tidy this
 * to start at `[1,1,1]`, or reorder FACES so a different face is
 * tessellated first, and the anchor moves to another corner: the STEP
 * slides up to (10, 11.45, height) metres away from the IFC and every
 * cross-format `#c:` permalink is wrong. `indexStepLogo.spec.ts` fails
 * if it happens — but its message points at BLOCKS, which will be
 * innocent, so start here.
 */
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]

/** The box's 12 edges as [from, to] corner pairs, shared between faces. */
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

/**
 * The box's 6 faces. `loop` lists [edge index, same-sense] pairs walking
 * the boundary counter-clockwise seen from outside, so the right-hand
 * rule gives `normal`. `origin` is the corner the face's plane is
 * anchored at and `ref` its plane's reference direction.
 */
// The entries are edge/corner indices into the tables above, not
// quantities — no-magic-numbers only exempts indices in subscript
// position, which these aren't.
/* eslint-disable no-magic-numbers */
const FACES = [
  {loop: [[3, false], [2, false], [1, false], [0, false]], origin: 0, normal: [0, 0, -1], ref: [1, 0, 0]},
  {loop: [[4, true], [5, true], [6, true], [7, true]], origin: 4, normal: [0, 0, 1], ref: [1, 0, 0]},
  {loop: [[0, true], [9, true], [4, false], [8, false]], origin: 0, normal: [0, -1, 0], ref: [1, 0, 0]},
  {loop: [[11, true], [6, false], [10, false], [2, true]], origin: 3, normal: [0, 1, 0], ref: [1, 0, 0]},
  {loop: [[8, true], [7, false], [11, false], [3, true]], origin: 0, normal: [-1, 0, 0], ref: [0, 1, 0]},
  {loop: [[1, true], [10, true], [5, false], [9, false]], origin: 1, normal: [1, 0, 0], ref: [0, 1, 0]},
]
/* eslint-enable no-magic-numbers */


/**
 * Formats a JS number as a STEP real, which — unlike JSON — must carry
 * a decimal point even when integral, and must spell an exponent with a
 * capital `E`.
 *
 * The exponent arm looks unreachable from today's BLOCKS, and is not:
 * BLOCKS is a hand transcription that gets redone when the logo changes,
 * and JS switches to exponential form at 1e21 and below 1e-6. Both
 * escape the naive formatting — `Number.isInteger(1e21)` is true, so the
 * integer branch would emit `1e+21.` — and neither is a legal Part 21
 * REAL. The failure mode is silent: an unparseable file that only shows
 * up as the viewer refusing to load it.
 *
 * @param {number} value
 * @return {string} STEP real literal
 */
function real(value) {
  // -0 prints as '-0.', which is legal but noise in a diff.
  const normalized = value === 0 ? 0 : value
  const text = `${normalized}`

  if (text.includes('e')) {
    const [mantissa, exponent] = text.split('e')
    return `${mantissa.includes('.') ? mantissa : `${mantissa}.`}E${exponent.replace('+', '')}`
  }

  return Number.isInteger(normalized) ? `${text}.` : text
}


/**
 * Formats a 3-vector as a STEP coordinate list.
 *
 * @param {Array<number>} vector
 * @return {string} e.g. "(0.,1.,0.)"
 */
function coords(vector) {
  return `(${vector.map(real).join(',')})`
}


/**
 * Accumulates STEP instances, handing back the `#id` reference for
 * each. Forward references are legal in Part 21, so entities can be
 * emitted in whatever order reads best.
 *
 * @return {{add: Function, toString: Function}} emitter
 */
function makeEmitter() {
  const lines = []
  return {
    /**
     * @param {string} body Entity body, without the trailing semicolon
     * @return {string} The `#id` reference to the emitted instance
     */
    add: (body) => {
      const id = lines.length + 1
      lines.push(`#${id} = ${body};`)
      return `#${id}`
    },
    /** @return {string} The DATA section body */
    toString: () => lines.join('\n'),
  }
}


/**
 * Emits an `AXIS2_PLACEMENT_3D` with the identity orientation.
 *
 * @param {object} step Emitter
 * @param {Array<number>} location Origin, in millimetres
 * @return {string} Reference to the placement
 */
function emitPlacement(step, location) {
  const point = step.add(`CARTESIAN_POINT('',${coords(location)})`)
  const axis = step.add(`DIRECTION('',(0.,0.,1.))`)
  const refDirection = step.add(`DIRECTION('',(1.,0.,0.))`)
  return step.add(`AXIS2_PLACEMENT_3D('',${point},${axis},${refDirection})`)
}


/**
 * Emits one axis-aligned box as a `MANIFOLD_SOLID_BREP`: 8 vertices, 12
 * shared edges, 6 planar faces.
 *
 * @param {object} step Emitter
 * @param {Array<number>} origin Minimum corner, in millimetres
 * @param {Array<number>} size Extents along x/y/z, in millimetres
 * @return {string} Reference to the solid
 */
function emitBox(step, origin, size) {
  const corner = (index) => CORNERS[index].map((unit, axis) => origin[axis] + (unit * size[axis]))

  const vertices = CORNERS.map((_, index) => {
    const point = step.add(`CARTESIAN_POINT('',${coords(corner(index))})`)
    return step.add(`VERTEX_POINT('',${point})`)
  })

  const edges = EDGES.map(([from, to]) => {
    const start = corner(from)
    const end = corner(to)
    const span = end.map((value, axis) => value - start[axis])
    const length = Math.hypot(...span)
    const basePoint = step.add(`CARTESIAN_POINT('',${coords(start)})`)
    const direction = step.add(`DIRECTION('',${coords(span.map((value) => value / length))})`)
    const vector = step.add(`VECTOR('',${direction},1.)`)
    const line = step.add(`LINE('',${basePoint},${vector})`)
    return step.add(`EDGE_CURVE('',${vertices[from]},${vertices[to]},${line},.T.)`)
  })

  const faces = FACES.map((face) => {
    const point = step.add(`CARTESIAN_POINT('',${coords(corner(face.origin))})`)
    const axis = step.add(`DIRECTION('',${coords(face.normal)})`)
    const refDirection = step.add(`DIRECTION('',${coords(face.ref)})`)
    const placement = step.add(`AXIS2_PLACEMENT_3D('',${point},${axis},${refDirection})`)
    const plane = step.add(`PLANE('',${placement})`)
    const orientedEdges = face.loop.map(([edge, sameSense]) =>
      step.add(`ORIENTED_EDGE('',*,*,${edges[edge]},${sameSense ? '.T.' : '.F.'})`))
    const loop = step.add(`EDGE_LOOP('',(${orientedEdges.join(',')}))`)
    const bound = step.add(`FACE_OUTER_BOUND('',${loop},.T.)`)
    return step.add(`ADVANCED_FACE('',(${bound}),${plane},.T.)`)
  })

  const shell = step.add(`CLOSED_SHELL('',(${faces.join(',')}))`)
  return step.add(`MANIFOLD_SOLID_BREP('',${shell})`)
}


/**
 * Emits the colour chain a CAD kernel writes for a solid:
 * `STYLED_ITEM → PRESENTATION_STYLE_ASSIGNMENT → SURFACE_STYLE_USAGE →
 * SURFACE_SIDE_STYLE → SURFACE_STYLE_FILL_AREA → … → COLOUR_RGB`. That
 * is the exact chain `AP214GeometryExtraction.extractSurfaceStyle`
 * walks, so a shortcut here renders as Conway's default light grey.
 *
 * @param {object} step Emitter
 * @param {string} solid Reference to the styled solid
 * @param {Array<number>} rgb Colour components in [0,1]
 * @return {string} Reference to the styled item
 */
function emitSolidColour(step, solid, rgb) {
  const colour = step.add(`COLOUR_RGB('',${rgb.map(real).join(',')})`)
  const fillColour = step.add(`FILL_AREA_STYLE_COLOUR('',${colour})`)
  const fillStyle = step.add(`FILL_AREA_STYLE('',(${fillColour}))`)
  const fillArea = step.add(`SURFACE_STYLE_FILL_AREA(${fillStyle})`)
  const sideStyle = step.add(`SURFACE_SIDE_STYLE('',(${fillArea}))`)
  const usage = step.add(`SURFACE_STYLE_USAGE(.BOTH.,${sideStyle})`)
  const assignment = step.add(`PRESENTATION_STYLE_ASSIGNMENT((${usage}))`)
  return step.add(`STYLED_ITEM('color',(${assignment}),${solid})`)
}


/**
 * Emits the `PRODUCT` → `PRODUCT_DEFINITION` → `PRODUCT_DEFINITION_SHAPE`
 * chain every node in the assembly needs. `name` is what the NavTree
 * shows: `AP214ProductStructureExtraction.resolveLabel` prefers the
 * product name over the occurrence's.
 *
 * `id` is the separate identity attribute, and AP214 expects it to be
 * unique per part. It defaults to `name` because for the assembly nodes
 * the two coincide; the two part shapes must pass their own, since both
 * are named 'Together' and an importer that keys parts by id would
 * otherwise merge the 30m and 15m blocks into one.
 *
 * @param {object} step Emitter
 * @param {object} contexts Shared `{product, definition}` context refs
 * @param {string} name Product name — the NavTree label
 * @param {string} [id] Unique product id; defaults to `name`
 * @return {{definition: string, shape: string}} refs
 */
function emitProduct(step, contexts, name, id = name) {
  const product = step.add(`PRODUCT('${id}','${name}','',(${contexts.product}))`)
  const formation = step.add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)
  const definition = step.add(`PRODUCT_DEFINITION('design','',${formation},${contexts.definition})`)
  const shape = step.add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)
  step.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(${product}))`)
  return {definition, shape}
}


/**
 * Places `child` inside `parent` at `placement`, the STEP way: a NAUO
 * for the product-structure side and a CDSR carrying the transform for
 * the geometry side. Conway's occurrence paths are the ordered NAUO
 * express ids, so one of these per placement is what makes the seven
 * blocks individually selectable despite sharing two shapes.
 *
 * @param {object} step Emitter
 * @param {object} args Placement inputs
 * @param {string} args.id Occurrence id, unique among the parent's children
 * @param {object} args.parent Parent `{product, representation}`
 * @param {object} args.child Child `{product, representation}`
 * @param {string} args.placement Where the child sits in the parent's frame
 * @param {string} args.identity The shared identity placement
 */
function emitOccurrence(step, {id, parent, child, placement, identity}) {
  const usage = step.add(
    `NEXT_ASSEMBLY_USAGE_OCCURRENCE('${id}','${id}','',` +
      `${parent.product.definition},${child.product.definition},$)`)
  const shape = step.add(`PRODUCT_DEFINITION_SHAPE('','',${usage})`)
  const transform = step.add(`ITEM_DEFINED_TRANSFORMATION('','',${identity},${placement})`)
  const relationship = step.add(
    `( REPRESENTATION_RELATIONSHIP('','',${child.representation},${parent.representation}) ` +
      `REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${transform}) ` +
      `SHAPE_REPRESENTATION_RELATIONSHIP() )`)
  step.add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${relationship},${shape})`)
}


/**
 * Builds the whole file.
 *
 * @return {string} STEP Part 21 text
 */
function generate() {
  const step = makeEmitter()

  const applicationContext =
    step.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`)
  step.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${applicationContext})`)
  const contexts = {
    product: step.add(`PRODUCT_CONTEXT('',${applicationContext},'mechanical')`),
    definition: step.add(`PRODUCT_DEFINITION_CONTEXT('part definition',${applicationContext},'design')`),
  }

  const lengthUnit = step.add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`)
  const angleUnit = step.add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`)
  const solidAngleUnit = step.add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`)
  const uncertainty = step.add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-004),${lengthUnit},` +
      `'distance_accuracy_value','confusion accuracy')`)
  const geometricContext = step.add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) ` +
      `GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${angleUnit},${solidAngleUnit})) ` +
      `REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`)

  // Shared by every representation as its own origin, and as the
  // "from" side of every occurrence transform.
  const identity = emitPlacement(step, [0, 0, 0])

  // One part shape per distinct block height. Geometry is in the part's
  // local frame — minimum corner at the origin — so the occurrence
  // placements below carry the block positions.
  const styledItems = []
  const heights = [...new Set(BLOCKS.map((block) => block.height))]
  const partsByHeight = new Map(heights.map((height) => {
    const solid = emitBox(
      step,
      [0, 0, 0],
      [BLOCK_WIDTH * MM_PER_M, BLOCK_DEPTH * MM_PER_M, height * MM_PER_M])
    styledItems.push(emitSolidColour(step, solid, LIME))
    return [height, {
      product: emitProduct(step, contexts, 'Together', `Together-${height}m`),
      representation: step.add(
        `ADVANCED_BREP_SHAPE_REPRESENTATION('',(${identity},${solid}),${geometricContext})`),
    }]
  }))

  // The IFC's spatial chain — project/site/building/storey — reads as a
  // sentence in the NavTree, so the STEP assembly keeps it: sub-assemblies
  // rather than a flat parent with seven children.
  const assemblies = ['Bldrs', 'Build', 'Every', 'Thing'].map((name) => ({
    name,
    product: emitProduct(step, contexts, name),
    placements: [],
    representation: null,
  }))

  const blockPlacements = BLOCKS.map((block) =>
    emitPlacement(step, [block.x * MM_PER_M, block.y * MM_PER_M, block.z * MM_PER_M]))
  assemblies[assemblies.length - 1].placements = blockPlacements

  // Each nested assembly sits at its parent's origin, so they share the
  // identity placement; only the leaf blocks are actually moved.
  for (const assembly of assemblies) {
    assembly.representation = step.add(
      `SHAPE_REPRESENTATION('',(${[identity, ...assembly.placements].join(',')}),${geometricContext})`)
  }

  for (const node of [...assemblies, ...partsByHeight.values()]) {
    step.add(`SHAPE_DEFINITION_REPRESENTATION(${node.product.shape},${node.representation})`)
  }

  assemblies.slice(1).forEach((assembly, index) => {
    emitOccurrence(step, {
      id: assembly.name,
      parent: assemblies[index],
      child: assembly,
      placement: identity,
      identity,
    })
  })

  BLOCKS.forEach((block, index) => {
    emitOccurrence(step, {
      id: `${index + 1}`,
      parent: assemblies[assemblies.length - 1],
      child: partsByHeight.get(block.height),
      placement: blockPlacements[index],
      identity,
    })
  })

  step.add(
    `MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',` +
      `(${styledItems.join(',')}),${geometricContext})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    // ASCII only: Part 21 strings are ISO 8859-1, and anything outside it
    // has to be escaped as `\X2\....\X0\`. An em dash here reaches STEP
    // users as mojibake in the first line they read, and fails a strict
    // syntax checker.
    `FILE_DESCRIPTION(('Bldrs logo - the STEP twin of public/index.ifc'),'2;1');`,
    `FILE_NAME('index.step','2022-03-04T16:39:21',('Bldrs'),('Bldrs, Inc.'),` +
      `'tools/models/makeIndexStep.mjs','Bldrs: Share','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));`,
    'ENDSEC;',
    'DATA;',
    step.toString(),
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}


// Resolved against the script, not the caller: a cwd-relative default
// makes `cd tools/models && node makeIndexStep.mjs` throw ENOENT, and
// from any other directory that happens to have a `public/` it writes
// the wrong file while still reporting success.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export {generate}

// Guarded so `makeIndexStep.test.js` can import `generate` and compare it
// against the committed bytes without writing into `public/`. That drift
// test is the only thing standing between an edit here and a stale
// `index.step`: every other check in the repo — eslint, Jest, even the
// alignment E2E — reads the committed file, so editing BLOCKS without
// regenerating would otherwise pass everything and surface later, at
// some unrelated regeneration.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outPath = process.argv[2] ?? path.join(repoRoot, 'public', 'index.step')
  fs.writeFileSync(outPath, generate())
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath}`)
}
