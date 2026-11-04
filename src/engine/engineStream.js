// The engine side of a streamed load (design/new/engine-worker.md §4, §7
// step 3): geometry copied out of the engine's wasm heap once and posted as
// transferable columns, parse-time previews, the end-of-load `done` packet,
// and the engine's log forwarded to the page's load report.
//
// Worker-safe, like engineHandler.js: no DOM, no store, no three.
import {forEachVectorItem} from '../viewer/ifc/conwayVector'


/* Column-major mat4 elements per placement. */
const MATRIX_ELEMENTS = 16
/* Interleaved floats per vertex (position + normal). Must match
 * `incrementalBatchedBuilder.js`'s VERT_STRIDE: the builder recovers the
 * vertex count by dividing the size this side reports by it. */
export const VERT_STRIDE = 6


/**
 * Copies each geometry out of the engine's heap at most once per load and
 * encodes pump batches as columns.
 *
 * Why copy here, at the batch, and not later: conway's GEOMETRY_BUDGET_MB
 * may evict a native geometry at the NEXT pump call (conway#535), and only
 * what the current call delivered is guaranteed resident. Copying inside the
 * same turn as the pump call is therefore always in that window, which is
 * the race the main-thread builder has to defend against
 * (`incrementalBatchedBuilder.js#resolveGeometry_`, Sentry SHARE-1NK) and
 * this side never meets.
 *
 * Adapted from #1756's `ConwayGeometry.worker.js` encoding (the geometry
 * worker pool, draft), plus an occurrence-path column for STEP.
 *
 * @param {object} api Conway IfcAPI
 * @param {number} modelID
 * @return {{encode: function(Array): object, sentCount: function(): number}}
 */
export function makeBatchEncoder(api, modelID) {
  // geometryExpressIDs already sent. A degenerate shape is recorded too, so
  // its rejection is not repeated for every placement that references it.
  const sent = new Set()

  /**
   * @param {number} id geometryExpressID
   * @return {?object} `{id, vertices, indices}`, or null when degenerate by
   *   the builder's own rules, so both sides skip the same placements
   */
  function copyGeometry(id) {
    // eslint-disable-next-line new-cap
    const geom = api.GetGeometry(modelID, id)
    if (!geom) {
      return null
    }
    // eslint-disable-next-line new-cap
    const indexSize = geom.GetIndexDataSize()
    // eslint-disable-next-line new-cap
    const vertSize = geom.GetVertexDataSize()
    if (indexSize === 0 || vertSize === 0 || vertSize % VERT_STRIDE !== 0) {
      return null
    }
    // Copies, not views: the views point into the wasm heap, which the next
    // extraction can grow (detaching them), and which cannot be transferred.
    // eslint-disable-next-line new-cap
    const vertices = new Float32Array(api.GetVertexArray(geom.GetVertexData(), vertSize))
    // eslint-disable-next-line new-cap
    const indices = new Uint32Array(api.GetIndexArray(geom.GetIndexData(), indexSize))
    return {id, vertices, indices}
  }

  /**
   * @param {Array} flatMeshes one pump call's FlatMeshes
   * @return {{placements: object, geometries: Array, transfer: Array, bytes: number, meshCount: number}}
   */
  function encode(flatMeshes) {
    const parents = []
    const geometryIds = []
    const transforms = []
    const colors = []
    // Occurrence paths (STEP), as offsets into one flat id list: placement i
    // owns pathIds[pathOffsets[i] .. pathOffsets[i + 1]). Empty for IFC,
    // where no placement carries one; a placement without a path has a
    // zero-length run, which decodes back to no `occurrencePath` at all.
    const pathOffsets = [0]
    const pathIds = []
    const geometries = []
    let meshCount = 0
    for (const flatMesh of flatMeshes) {
      const parent = flatMesh?.expressID
      if (parent === undefined || !flatMesh.geometries) {
        continue
      }
      meshCount++
      forEachVectorItem(flatMesh.geometries, (placed) => {
        const gid = placed?.geometryExpressID
        if (gid === undefined) {
          return
        }
        if (!sent.has(gid)) {
          sent.add(gid)
          const copied = copyGeometry(gid)
          if (copied !== null) {
            geometries.push(copied)
          }
        }
        parents.push(parent)
        geometryIds.push(gid)
        const m = placed.flatTransformation
        for (let k = 0; k < MATRIX_ELEMENTS; k++) {
          transforms.push(m[k])
        }
        // NaN marks "no colour", so the page leaves `color` unset and the
        // builder applies its own DEFAULT_COLOR, as it would on the main
        // thread, rather than drawing opaque black.
        const c = placed.color
        if (c) {
          colors.push(c.x, c.y, c.z, c.w)
        } else {
          colors.push(NaN, NaN, NaN, NaN)
        }
        const path = placed.occurrencePath
        if (path) {
          // An Array or an Embind vector: forEachVectorItem reads either.
          forEachVectorItem(path, (id) => pathIds.push(id))
        }
        pathOffsets.push(pathIds.length)
      })
    }
    const placements = {
      parents: Uint32Array.from(parents),
      geometryIds: Uint32Array.from(geometryIds),
      transforms: Float64Array.from(transforms),
      colors: Float32Array.from(colors),
    }
    if (pathIds.length > 0) {
      placements.pathOffsets = Uint32Array.from(pathOffsets)
      placements.pathIds = Uint32Array.from(pathIds)
    }
    const transfer = Object.values(placements).map((column) => column.buffer)
    let bytes = transfer.reduce((sum, buffer) => sum + buffer.byteLength, 0)
    for (const g of geometries) {
      transfer.push(g.vertices.buffer, g.indices.buffer)
      bytes += g.vertices.byteLength + g.indices.byteLength
    }
    return {placements, geometries, transfer, bytes, meshCount}
  }

  return {encode, sentCount: () => sent.size}
}


/**
 * One parse-time preview payload, ready to post. Vertex and index data are
 * transferred where the view owns its whole buffer; a view into a larger
 * buffer is copied, because transferring would detach the rest of it.
 *
 * @param {object} payload conway PreviewMeshPayload
 * @return {{payload: object, transfer: Array}}
 */
export function previewMessage(payload) {
  const transfer = []
  const own = (view) => {
    if (!view) {
      return view
    }
    const whole = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    const owned = whole ? view : view.slice()
    transfer.push(owned.buffer)
    return owned
  }
  const out = {
    expressID: payload.expressID,
    geometryExpressID: payload.geometryExpressID,
    color: payload.color ? {...payload.color} : payload.color,
    flatTransformation: payload.flatTransformation ? Array.from(payload.flatTransformation) : undefined,
    vertexData: own(payload.vertexData),
    indexData: own(payload.indexData),
  }
  if (payload.aabb) {
    out.aabb = {min: Array.from(payload.aabb.min), max: Array.from(payload.aabb.max)}
  }
  return {payload: out, transfer}
}


/**
 * The statistics getters `ShareIfcLoader#parse` reads at the end of a load,
 * called here and sent as plain values. A getter the engine lacks is left
 * out, so the page sees "absent", which its readers treat as unknown.
 */
const STATISTICS_GETTERS = Object.freeze([
  'getGeometryMemory', 'getTotalTime', 'getErrorCount', 'getWarningCount',
  'getProductCount', 'getProductsWithGeometryCount', 'getDataDefectCount',
  'getGeometryTime', 'getVersion', 'getLoadStatus', 'getOriginatingSystem',
  'getPreprocessorVersion', 'getParseTime', 'getLoadFailureReason',
])


/**
 * @param {object} statistics conway Statistics object, or undefined
 * @return {object|undefined} `{getterName: value, projectName}`
 */
export function snapshotStatistics(statistics) {
  if (!statistics) {
    return undefined
  }
  const out = {}
  for (const name of STATISTICS_GETTERS) {
    if (typeof statistics[name] === 'function') {
      try {
        const value = statistics[name]()
        if (value === undefined || ['number', 'string', 'boolean'].includes(typeof value)) {
          out[name] = value
        }
      } catch {
        // A getter that throws is an absent value, as on the main thread.
      }
    }
  }
  if (typeof statistics.projectName === 'string') {
    out.projectName = statistics.projectName
  }
  return out
}


/**
 * Forward the engine's log to the page (design §2.4 G3). The page's load
 * report tallies conway's Logger through a proxy and its console through a
 * tee (`loader/loadProgress.js`), and neither can see a worker: its Logger
 * is another module instance and its console is its own.
 *
 * Entries are folded by `(level, category, message)` with a count, so a bad
 * STEP file's hundreds of thousands of identical warnings cross as a few
 * hundred rows; the page replays each row `count` times, which keeps the
 * report's Total-vs-Distinct numbers exact. Only what the report reads is
 * kept: warning/error entries, and data defects at any level.
 *
 * @param {object} options
 * @param {object} options.logger conway's static Logger (worker's instance)
 * @param {object} options.console the worker's console
 * @param {string} options.dataDefect conway's DATA_DEFECT category value
 * @return {{take: function(): ?object, dispose: function(): void}}
 */
export function makeLogForwarder({logger, console: con, dataDefect}) {
  let entries = new Map()
  let lines = new Map()
  const proxy = {
    log: (entry) => {
      if (typeof entry?.message !== 'string') {
        return
      }
      const isSeverity = entry.level === 'warning' || entry.level === 'error'
      if (!isSeverity && entry.category !== dataDefect) {
        return
      }
      const key = `${entry.level}\u0000${entry.category ?? ''}\u0000${entry.message}`
      const row = entries.get(key)
      if (row) {
        row.count++
      } else {
        entries.set(key, {level: entry.level, category: entry.category, message: entry.message, count: 1})
      }
    },
  }
  logger.addProxy(proxy)
  const originalWarn = con.warn
  const originalError = con.error
  const tee = (level, original) => (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ')
    const key = `${level}\u0000${text}`
    const row = lines.get(key)
    if (row) {
      row.count++
    } else {
      lines.set(key, {level, text, count: 1})
    }
    original.apply(con, args)
  }
  con.warn = tee('warning', originalWarn)
  con.error = tee('error', originalError)
  return {
    /** @return {?object} `{entries, lines}` since the last take, or null */
    take() {
      if (entries.size === 0 && lines.size === 0) {
        return null
      }
      const out = {entries: Array.from(entries.values()), lines: Array.from(lines.values())}
      entries = new Map()
      lines = new Map()
      return out
    },
    dispose() {
      logger.removeProxy(proxy)
      con.warn = originalWarn
      con.error = originalError
    },
  }
}
