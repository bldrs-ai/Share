/**
 * IFC GlobalId minting and the compressed-GUID codec (create-300 L1, #1916;
 * design/new/create-engine.md §B3, design/new/model-edit.md §5).
 *
 * An `IfcGloballyUniqueId` is 128 bits written as 22 characters of IFC's own
 * base-64 alphabet, most significant bits first: the first character carries
 * the top 2 bits (so it is always `0`–`3`) and each of the other 21 carries 6.
 * The alphabet is NOT RFC 4648 base64 — digits come first and the last two
 * symbols are `_` and `$` — so `btoa` cannot be used.
 *
 * Minting happens when an op is CREATED, never at apply, replay or export
 * (create-engine.md §B3): the GlobalId is stored in the op as the element's
 * `g` ref, so a redo or a replay re-creates the same element under the same
 * name and a later op that targets it still resolves.
 */


/** IFC's base-64 alphabet, in digit order. */
export const IFC_BASE64_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/** Characters in a compressed GlobalId. */
export const GLOBAL_ID_LENGTH = 22

/** Bytes of entropy in one GlobalId. */
export const GLOBAL_ID_BYTES = 16

// 2 + 21 × 6 = 128.
const FIRST_CHAR_BITS = 2
const CHAR_BITS = 6
const BYTE_BITS = 8

/**
 * 22 characters of the alphabet. The same grammar `viewer/tools/refs.js`
 * accepts for a source element's GlobalId: a file is untrusted and some
 * authoring tools write a first character past `3`, and an element whose
 * GlobalId is out of spec is still an element the user may want to edit.
 * {@link isCanonicalGlobalId} is the strict 128-bit form, which every id
 * {@link mintGlobalId} makes satisfies.
 */
export const GLOBAL_ID_PATTERN = /^[0-9A-Za-z_$]{22}$/

const CANONICAL_GLOBAL_ID_PATTERN = /^[0-3][0-9A-Za-z_$]{21}$/


/**
 * @param {*} text
 * @return {boolean} whether `text` is 22 characters of the IFC alphabet
 */
export function isGlobalId(text) {
  return typeof text === 'string' && GLOBAL_ID_PATTERN.test(text)
}


/**
 * @param {*} text
 * @return {boolean} whether `text` encodes exactly 128 bits (first character
 *   `0`–`3`)
 */
export function isCanonicalGlobalId(text) {
  return typeof text === 'string' && CANONICAL_GLOBAL_ID_PATTERN.test(text)
}


/**
 * Compress 16 bytes to a GlobalId.
 *
 * @param {Uint8Array} bytes exactly {@link GLOBAL_ID_BYTES} bytes
 * @return {string}
 */
export function compressGlobalId(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== GLOBAL_ID_BYTES) {
    throw new TypeError(`compressGlobalId: need ${GLOBAL_ID_BYTES} bytes`)
  }
  let bitPos = 0
  const take = (count) => {
    let value = 0
    for (let i = 0; i < count; i++) {
      const byte = bytes[Math.floor(bitPos / BYTE_BITS)]
      const bit = (byte >> (BYTE_BITS - 1 - (bitPos % BYTE_BITS))) & 1
      value = (value << 1) | bit
      bitPos++
    }
    return value
  }
  let out = IFC_BASE64_ALPHABET[take(FIRST_CHAR_BITS)]
  for (let i = 1; i < GLOBAL_ID_LENGTH; i++) {
    out += IFC_BASE64_ALPHABET[take(CHAR_BITS)]
  }
  return out
}


/**
 * Inverse of {@link compressGlobalId}.
 *
 * @param {string} text
 * @return {Uint8Array|null} the 16 bytes, or null when `text` is not a
 *   canonical GlobalId
 */
export function decompressGlobalId(text) {
  if (!isCanonicalGlobalId(text)) {
    return null
  }
  const bytes = new Uint8Array(GLOBAL_ID_BYTES)
  let bitPos = 0
  const put = (value, count) => {
    for (let i = count - 1; i >= 0; i--) {
      if ((value >> i) & 1) {
        bytes[Math.floor(bitPos / BYTE_BITS)] |= 1 << (BYTE_BITS - 1 - (bitPos % BYTE_BITS))
      }
      bitPos++
    }
  }
  put(IFC_BASE64_ALPHABET.indexOf(text[0]), FIRST_CHAR_BITS)
  for (let i = 1; i < GLOBAL_ID_LENGTH; i++) {
    put(IFC_BASE64_ALPHABET.indexOf(text[i]), CHAR_BITS)
  }
  return bytes
}


/**
 * @param {number} length
 * @return {Uint8Array} cryptographically random bytes
 */
function cryptoRandomBytes(length) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}


/**
 * Mint a fresh GlobalId: 128 random bits, compressed.
 *
 * @param {object} [options]
 * @param {function(number): Uint8Array} [options.randomBytes] byte source;
 *   defaults to `crypto.getRandomValues`. Tests inject a seeded one so a
 *   minted id is deterministic.
 * @return {string}
 */
export function mintGlobalId({randomBytes = cryptoRandomBytes} = {}) {
  return compressGlobalId(randomBytes(GLOBAL_ID_BYTES))
}
