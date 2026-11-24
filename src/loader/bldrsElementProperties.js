// BLDRS_element_properties GLTF extension — the reader: the GLTFLoader
// plugin and the lazy per-entity payload a cache-hit model's
// `getItemProperties` / `getPropertySets` read through.
//
// The capture that writes the extension, and the wire format, are in
// `bldrsElementPropertiesCapture.js` (its header says why the two are
// separate modules). See `design/new/viewer-replacement.md` §3b.iii and
// `design/new/glb-model-sharing.md` §"Extension catalogue".
//
// Reader is **lazy** — the `afterRoot` hook stores the container
// bytes and per-entity accessors on `userData.bldrsElementProperties`.
// The header (index + pset table) decodes on the first
// `model.getItemProperties` / `model.getPropertySets` call; record
// blocks decode on demand. A load that never opens the Properties
// panel pays nothing.
//
// TODO(viewer-replacement Phase 5+): same untrusted-input concern as
// `bldrsSpatialTree.js`. Today the writer is in-browser and trusted;
// shape validation is minimal. Once GLBs arrive from arbitrary user
// browsers (originator-side share), enforce the full validation pass
// per `design/new/glb-model-sharing.md` §"Validation and trust" —
// size ceilings (decompressed payload up to a hard cap; the doc
// suggests 100MB), HTML-strip on user-authored strings before any
// DOM render, integrity check (every key in `propertySets` exists
// as a product in `itemProperties`).
import * as pako from 'pako'
import useStore from '../store/useStore'
import {BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME, parseContainerHeader} from './bldrsElementPropertiesCapture'
import {glbInfo} from './glbLog'


// The pre-0.13.0 payload format's leading bytes (one monolithic gzip),
// which the reader refuses with an alert rather than decoding.
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b


// Decoded (inflated + parsed) blocks the reader keeps hot, LRU.
// Properties-panel access patterns hop between a product's block and
// the blocks holding its psets / owner history / material refs —
// a handful of ~1MB blocks covers that working set.
const BLOCK_CACHE_MAX = 16


/**
 * GLTFLoader plugin that registers the BLDRS_element_properties
 * extension. Stores the container bytes + per-entity accessors
 * (`getRecord` / `getPsetIds`) on
 * `gltf.scene.userData.bldrsElementProperties`; the header index
 * decodes on the first access and record blocks decode on demand
 * (the Properties panel may never open).
 *
 * A payload in the pre-0.13.0 monolithic-gzip format is NOT decoded
 * — there is deliberately no legacy read path. It raises a
 * "clear your local cache" alert instead and attaches nothing, so
 * the panel degrades the same as a GLB without the extension.
 * Locally cached old artifacts never reach here (the schema-version
 * bump in `glbCacheKey.js` makes them read as a cache miss); this
 * covers old GLBs arriving as files.
 *
 * Register at GLTFLoader construction:
 *   loader.register((parser) => new BldrsElementPropertiesReader(parser))
 *
 * The userData payload shape is intentionally not the decoded tables
 * — `Loader.js#convertToShareModel` wires `model.getItemProperties`
 * through the lazy accessors.
 */
export class BldrsElementPropertiesReader {
  /**
   * @param {object} parser GLTFLoader parser passed at registration time
   */
  constructor(parser) {
    this.name = BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME
    this.parser = parser
  }

  /**
   * @param {object} gltf parsed GLTF object
   * @return {Promise<object>} the same gltf object (per GLTFLoader extension contract)
   */
  async afterRoot(gltf) {
    const json = this.parser.json
    const ext = json.extensions?.[this.name]
    if (!ext) {
      return gltf
    }
    if (!ext.compressed || ext.bufferView === undefined) {
      // Reserved for an uncompressed-inline variant; nothing to wire
      // up today. Land that branch when the spec calls for it.
      return gltf
    }
    if (!Array.isArray(json.bufferViews) ||
        !Number.isInteger(ext.bufferView) ||
        ext.bufferView < 0 ||
        ext.bufferView >= json.bufferViews.length) {
      glbInfo(
        `${this.name}: extension references out-of-range bufferView ` +
        `${ext.bufferView} (have ${json.bufferViews?.length ?? 0}); skipping`)
      return gltf
    }

    try {
      const bv = json.bufferViews[ext.bufferView]
      const bufferIndex = bv.buffer
      const byteOffset = bv.byteOffset || 0
      const byteLength = bv.byteLength
      const arrayBuffer = await this.parser.getDependency('buffer', bufferIndex)
      // Hold a Uint8Array view (not a copy) over the parsed BIN
      // chunk. Cheap: no allocation, no decompression. The first
      // accessor call below pays the decode cost.
      const compressed = new Uint8Array(arrayBuffer, byteOffset, byteLength)
      // Pre-0.13.0 payloads were one monolithic gzip (leading bytes
      // 0x1f 0x8b) — a format the reader deliberately no longer
      // decodes (see class comment). Alert instead of attaching so
      // the Properties panel's silence is explained and actionable.
      if (compressed.byteLength >= 2 &&
          compressed[0] === GZIP_MAGIC_0 && compressed[1] === GZIP_MAGIC_1) {
        glbInfo(
          `${this.name}: payload is the pre-0.13.0 monolithic gzip format; ` +
          'not decoding — alerting to clear cache')
        useStore.getState().setAlert(
          'This model was cached in an older format that this version of Share ' +
          'no longer reads, so element properties are unavailable. ' +
          'Clear the local cache (Profile menu → Clear Local Cache) and reload the model to rebuild it.')
        return gltf
      }
      const payload = makeElementPropertiesPayload(compressed, this.name)
      if (gltf.scene) {
        gltf.scene.userData.bldrsElementProperties = payload
      } else {
        glbInfo(`${this.name}: gltf has no default scene; cannot attach payload`)
      }
    } catch (e) {
      glbInfo(`${this.name}: failed to wire payload:`, e)
    }
    return gltf
  }
}


/**
 * Build a lazy per-entity payload over container bytes. Exposed so
 * `Loader.js#convertToShareModel` consumers and tests can construct
 * the same shape directly for non-GLTFLoader code paths.
 *
 * The header (id→block index + pset table) decodes on the first
 * accessor call; each record block inflates + parses only when one
 * of its entities is requested, then rides a small LRU. Nothing here
 * ever materialises the whole closure — the strings and object
 * graphs in play are bounded by the capture's BLOCK_TARGET_CHARS per block, which
 * is what makes arbitrarily large models decodable at all (V8 caps
 * a single string at ~512MiB; see the header comment).
 *
 * Any decode failure (bad magic, truncated bytes, corrupt block)
 * logs and degrades to "no record found" — consumers show "no props"
 * rather than crash.
 *
 * @param {Uint8Array} compressed container bytes
 * @param {string} [tag] log-prefix tag (e.g. extension name)
 * @return {object} `{compressed, getRecord(expressID), getPsetIds(expressID)}`
 */
export function makeElementPropertiesPayload(compressed, tag = BLDRS_ELEMENT_PROPERTIES_EXTENSION_NAME) {
  let header = null
  let blocksStart = 0
  let idToBlock = null
  let headerFailed = false
  // blockIndex → parsed record object. Insertion-ordered Map as LRU:
  // a hit re-inserts, eviction takes the oldest key.
  const blockCache = new Map()

  const ensureHeader = () => {
    if (header !== null || headerFailed) {
      return
    }
    try {
      const parsed = parseContainerHeader(compressed)
      header = parsed.header
      blocksStart = parsed.blocksStart
      idToBlock = new Map()
      header.blockIds.forEach((ids, blockIndex) => {
        for (const id of ids) {
          idToBlock.set(id, blockIndex)
        }
      })
      // One-shot per cache hit — visible by default so user-reported
      // "panel is empty" issues can be triaged from the console
      // without flipping a feature flag. The entity/pset counts are
      // the most useful diagnostic: a count of 0 means the writer
      // captured nothing (likely no spatial tree on the source IFC);
      // a non-zero count with empty panel points at consumer wiring.
      glbInfo(
        `${tag}: decoded payload index (${compressed.byteLength}B container, ` +
        `${header.blocks.length} blocks, ` +
        `${idToBlock.size} entities, ` +
        `${Object.keys(header.propertySets).length} products with psets)`)
    } catch (e) {
      glbInfo(`${tag}: decode failed:`, e)
      headerFailed = true
    }
  }

  const getBlock = (blockIndex) => {
    const cached = blockCache.get(blockIndex)
    if (cached !== undefined) {
      blockCache.delete(blockIndex)
      blockCache.set(blockIndex, cached)
      return cached
    }
    let records
    try {
      const [offset, byteLength] = header.blocks[blockIndex]
      const blockBytes = compressed.subarray(blocksStart + offset, blocksStart + offset + byteLength)
      records = JSON.parse(pako.ungzip(blockBytes, {to: 'string'}))
    } catch (e) {
      glbInfo(`${tag}: block ${blockIndex} decode failed:`, e)
      // Cache the failure as an empty block so a corrupt block logs
      // once instead of re-inflating on every access to its entities.
      records = {}
    }
    blockCache.set(blockIndex, records)
    if (blockCache.size > BLOCK_CACHE_MAX) {
      blockCache.delete(blockCache.keys().next().value)
    }
    return records
  }

  return {
    compressed,
    /**
     * @param {number} expressID
     * @return {object|undefined} the entity record, undefined if absent
     */
    getRecord(expressID) {
      ensureHeader()
      if (header === null) {
        return undefined
      }
      const blockIndex = idToBlock.get(Number(expressID))
      if (blockIndex === undefined) {
        return undefined
      }
      return getBlock(blockIndex)[expressID]
    },
    /**
     * @param {number} expressID product id
     * @return {Array<number>} pset expressIDs, [] if none
     */
    getPsetIds(expressID) {
      ensureHeader()
      const psetIds = header?.propertySets?.[expressID]
      return Array.isArray(psetIds) ? psetIds : []
    },
  }
}
