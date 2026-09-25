import {AdaptiveModel} from './arith'
import BitReader from './bitstream'
import {readTree} from './trees'


/**
 * The MetaStream mesh header, from the start of the `mesh` bitstream up to
 * the point where the arithmetic decoder starts (design/new/adf-mts-decoder.md
 * §2). Field order is the DLL's (`0x1180faa0` and the routines it calls);
 * each comment names the routine a block comes from.
 *
 * Only the paths every ADF crown and initial-shape stream takes are
 * implemented. The rest throw `UnsupportedMtsError`, so a stream that needs
 * them fails loudly and ADF loading falls back to a proxy crown for that
 * tooth.
 */


// Sanity bounds on header values, so a corrupt stream fails here instead of
// sizing arrays or loops from garbage. Each is far outside what real streams
// use: the densest crown in the fixture spends 53 bits per vertex and 26 per
// face (and a split adds at least one vertex), and its largest alphabet is 10.
const MIN_BITS_PER_VERTEX = 1
const MIN_BITS_PER_FACE = 0.5
const MAX_ALPHABET = 1024


/** A stream uses a MetaStream feature this port does not implement. */
export class UnsupportedMtsError extends Error {
  /** @param {string} what */
  constructor(what) {
    super(`mts: unsupported stream feature: ${what}`)
    this.name = 'UnsupportedMtsError'
  }
}


/**
 * @param {BitReader} bs positioned at bit 0
 * @return {object}
 */
export function readHeader(bs) {
  // 0x11810a90: 32 flag bits. Bit 0 means a key-protected stream.
  const flags = bs.readBits(32)
  if (flags & 1) {
    throw new UnsupportedMtsError('encryption key')
  }
  if (bs.readUInt() !== 0) {
    throw new UnsupportedMtsError('stream version')
  }

  // 0x1180ffb0: six counts. The split loop runs `splits` times; a non-empty
  // base mesh (decoded by 0x1181aef0) never occurs in ADF streams.
  const counts = {
    vertices: bs.readUInt(),
    faces: bs.readUInt(),
    baseVertices: bs.readUInt(),
    baseFaces: bs.readUInt(),
    splits: bs.readUInt(),
    reserved: bs.readUInt(),
  }
  if (counts.baseVertices !== 0 || counts.baseFaces !== 0) {
    throw new UnsupportedMtsError('non-empty base mesh')
  }
  if (counts.vertices * MIN_BITS_PER_VERTEX > bs.length || counts.splits * MIN_BITS_PER_VERTEX > bs.length ||
    counts.faces * MIN_BITS_PER_FACE > bs.length) {
    throw new Error(`mts: corrupt stream (${counts.vertices} vertices, ${counts.faces} faces, ` +
      `${counts.splits} splits in ${bs.length} bits)`)
  }

  // 0x11819e20: named plug-in parameters. A set bit after a name carries
  // values none of these streams use.
  const pluginParams = []
  const paramCount = bs.readUInt()
  for (let k = 0; k < paramCount; k++) {
    pluginParams.push(bs.readString())
    if (bs.read1()) {
      throw new UnsupportedMtsError('plug-in parameter values')
    }
  }

  const position = readPositionQuantizer(bs)
  readVertexChannels(bs)
  readFrameHeader(bs)
  const faceFlags = readFaceFlagNames(bs)

  // 0x1181b5b0: the coordinate trees, delta x/y/z first, then absolute
  // x/y/z. Delta trees code a vertex relative to its reference vertex;
  // absolute trees code a vertex that has none (the first one).
  const deltaTrees = [readTree(bs), readTree(bs), readTree(bs)]
  const absoluteTrees = [readTree(bs), readTree(bs), readTree(bs)]

  const models = readModels(bs, faceFlags.channels)
  const arithBudget = bs.readUInt()

  return {counts, pluginParams, position, faceFlags, deltaTrees, absoluteTrees, models, arithBudget}
}


/**
 * `0x11819570`: the position quantizer. The DLL computes `scale` with x87;
 * this mirrors its operand widths (x's extent stays full precision, y's and
 * z's are rounded to float32 first), which reproduces its float32 results
 * on every stream checked.
 *
 * @param {BitReader} bs
 * @return {{min: Array<number>, max: Array<number>, bits: Array<number>, scale: Float32Array, offset: Float32Array}}
 */
function readPositionQuantizer(bs) {
  const min = [bs.readFloat32(), bs.readFloat32(), bs.readFloat32()]
  const max = [bs.readFloat32(), bs.readFloat32(), bs.readFloat32()]
  const bits = [bs.readBits(5), bs.readBits(5), bs.readBits(5)]
  const steps = bits.map((b) => (2 ** b) - 1)
  const scale = new Float32Array([
    (max[0] - min[0]) / steps[0],
    Math.fround(max[1] - min[1]) / steps[1],
    Math.fround(max[2] - min[2]) / steps[2],
  ])
  return {min, max, bits, scale, offset: new Float32Array(min)}
}


/**
 * `0x11817850`: a vertex-attribute plug-in's channel table. Nothing in it
 * affects decoding here, but its bits must be consumed.
 *
 * @param {BitReader} bs
 */
function readVertexChannels(bs) {
  bs.read1()
  const n = bs.readUInt()
  let anyFlag = false
  for (let k = 0; k < n; k++) {
    anyFlag = bs.read1() === 1 || anyFlag
    bs.readUInt()
  }
  if (anyFlag) {
    throw new UnsupportedMtsError('flagged vertex channels')
  }
}


/**
 * `0x11817090`: a 4-bit type, then one or two 32-bit words (floats the
 * viewer uses, not the mesh decoder).
 *
 * @param {BitReader} bs
 */
function readFrameHeader(bs) {
  const type = bs.readBits(4)
  if (type === 0) {
    bs.readBits(32)
    bs.readBits(32)
  } else if (type === 1) {
    bs.readBits(32)
  } else {
    throw new UnsupportedMtsError(`frame header type ${type}`)
  }
}


/**
 * `0x11814390`: the face-flag plug-in. Each face carries a bitmask of these
 * named flags ("Fbits0".. in ADF crowns), one 32-bit channel per 32 names.
 *
 * @param {BitReader} bs
 * @return {{names: Array<string>, channels: number}}
 */
function readFaceFlagNames(bs) {
  const negative = bs.read1()
  const magnitude = bs.readUInt()
  const count = negative ? -magnitude : magnitude
  const names = []
  for (let k = 0; k < count; k++) {
    names.push(bs.readString())
  }
  return {names, channels: Math.max(0, Math.ceil(count / 32))}
}


/**
 * `0x1181e9c0`: the arithmetic models, in the order their descriptors were
 * registered. Offsets and some alphabet sizes are fixed by the DLL's
 * constructors rather than stored; the stream carries the rest.
 *
 * A "value" model returns `symbol + offset`; a "bounded" one is decoded
 * with `symbolBounded` and also offset (always 0 here).
 *
 * @param {BitReader} bs
 * @param {number} faceFlagChannels
 * @return {object} models by role
 */
function readModels(bs, faceFlagChannels) {
  if (faceFlagChannels !== 1) {
    throw new UnsupportedMtsError(`${faceFlagChannels} face-flag channels`)
  }
  // A vertex-channel model with a fixed shape; no split reads it.
  const channelModel = valueModel(-1, 2)
  // The face-flag channel: its offset and alphabet are both stored.
  const flagNegative = bs.read1()
  const flagOffset = bs.readUInt()
  const faceFlag = valueModel(flagNegative ? -flagOffset : flagOffset, bs.readUInt())
  // The split decoder's own models (0x1181b830), named after the call
  // sites that read them (see the spec's census table).
  const common = valueModel(0, 2) // m0: common split or not
  const splitsExisting = valueModel(0, 2) // m4: rare split cuts an existing vertex
  const extraFlag = valueModel(0, bs.readUInt()) // m1
  const faceCount = valueModel(0, bs.readUInt()) // m5
  const existingCount = valueModel(0, bs.readUInt()) // m2
  const newCount = valueModel(0, bs.readUInt()) // m3
  const fanSize = boundedModel(bs.readUInt()) // m9
  const cutSize = boundedModel(bs.readUInt()) // m8
  const firstOrientation = boundedModel(bs.readUInt()) // m6
  boundedModel(bs.readUInt()) // an unused tenth model
  return {channelModel, faceFlag, common, splitsExisting, extraFlag, faceCount, existingCount, newCount,
    fanSize, cutSize, firstOrientation}
}


/**
 * @param {number} offset
 * @param {number} alphabet
 * @return {{model: AdaptiveModel, offset: number}}
 */
function valueModel(offset, alphabet) {
  return {model: newModel(alphabet), offset}
}


/**
 * @param {number} alphabet
 * @return {{model: AdaptiveModel, offset: number}}
 */
function boundedModel(alphabet) {
  return {model: newModel(alphabet), offset: 0}
}


/**
 * An alphabet of 0 is let through: nothing reads the unused tenth model, and
 * `ArithDecoder` throws if a corrupt stream decodes from an empty one.
 *
 * @param {number} alphabet
 * @return {AdaptiveModel}
 */
function newModel(alphabet) {
  if (alphabet > MAX_ALPHABET) {
    throw new Error(`mts: corrupt stream (model alphabet ${alphabet})`)
  }
  return new AdaptiveModel(alphabet)
}
