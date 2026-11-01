import {JSONSchema, JSONSchemaType} from './types'


/**
 * A minimal JSON Schema validator: the subset tool input schemas need, and
 * nothing else.
 *
 * Why not ajv or zod: the repo has no validator dependency, and the AI SDK
 * (D7, §9) brings zod when the agent loop lands (#1675) — adding a second
 * one now for a dozen flat input schemas isn't worth the bytes. If that loop
 * makes zod available, revisit.
 *
 * Supported keywords: `type` (one or a list), `properties`, `required`,
 * `additionalProperties: false`, `items`, `enum`, `minItems` / `maxItems`,
 * `minimum` / `maximum`, `minLength` / `maxLength`, and the annotation-only
 * `description`. A schema using any other keyword is REJECTED by
 * {@link assertSupportedSchema} when its tool registers. The alternative —
 * ignoring keywords we don't implement — would let a tool author write
 * `pattern` or `oneOf`, believe the input was checked, and get no check.
 */


const SUPPORTED_KEYWORDS = new Set([
  'type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'enum',
  'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength',
])

const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])


/**
 * Throw when `schema` uses a keyword or type this validator doesn't
 * implement, naming the path to it.
 *
 * @param schema
 * @param path where `schema` sits, for the message
 */
export function assertSupportedSchema(schema: JSONSchema, path = '#'): void {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`${path}: schema must be an object`)
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new Error(`${path}: unsupported schema keyword '${key}' (supported: ${[...SUPPORTED_KEYWORDS].join(', ')})`)
    }
  }
  const types = schema.type === undefined ? [] : ([] as JSONSchemaType[]).concat(schema.type)
  for (const type of types) {
    if (!TYPES.has(type)) {
      throw new Error(`${path}: unsupported type '${type}'`)
    }
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    throw new Error(`${path}: only 'additionalProperties: false' is supported`)
  }
  for (const [name, sub] of Object.entries(schema.properties ?? {})) {
    assertSupportedSchema(sub, `${path}/properties/${name}`)
  }
  if (schema.items !== undefined) {
    assertSupportedSchema(schema.items, `${path}/items`)
  }
}


/**
 * Validate `value` against `schema`.
 *
 * @param schema
 * @param value
 * @return one human-readable problem per violation, each prefixed by the
 *   JSON-pointer-ish path to the offending value; empty when valid
 */
export function validate(schema: JSONSchema, value: unknown): string[] {
  const problems: string[] = []
  check(schema, value, '#', problems)
  return problems
}


/**
 * @param schema
 * @param value
 * @param path
 * @param problems accumulator
 */
function check(schema: JSONSchema, value: unknown, path: string, problems: string[]): void {
  if (schema.type !== undefined) {
    const types = ([] as JSONSchemaType[]).concat(schema.type)
    if (!types.some((type) => isType(value, type))) {
      problems.push(`${path}: expected ${types.join(' or ')}, got ${describeType(value)}`)
      // Every check below assumes the type; reporting them too would bury
      // the one problem that matters under its consequences.
      return
    }
  }
  if (schema.enum !== undefined && !schema.enum.some((option) => option === value)) {
    problems.push(`${path}: must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(', ')}`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      problems.push(`${path}: must be >= ${schema.minimum}`)
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      problems.push(`${path}: must be <= ${schema.maximum}`)
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      problems.push(`${path}: must be at least ${schema.minLength} characters`)
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      problems.push(`${path}: must be at most ${schema.maxLength} characters`)
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push(`${path}: must have at least ${schema.minItems} items`)
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      problems.push(`${path}: must have at most ${schema.maxItems} items`)
    }
    if (schema.items !== undefined) {
      const items = schema.items
      value.forEach((item, i) => check(items, item, `${path}/${i}`, problems))
    }
  }
  if (isPlainObject(value)) {
    const obj = value as Record<string, unknown>
    for (const name of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(obj, name) || obj[name] === undefined) {
        problems.push(`${path}: missing required property '${name}'`)
      }
    }
    const properties = schema.properties ?? {}
    for (const [name, sub] of Object.entries(properties)) {
      if (obj[name] !== undefined) {
        check(sub, obj[name], `${path}/${name}`, problems)
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = Object.keys(properties)
      for (const name of Object.keys(obj)) {
        if (!Object.prototype.hasOwnProperty.call(properties, name)) {
          problems.push(`${path}: unknown property '${name}' (allowed: ${allowed.join(', ') || 'none'})`)
        }
      }
    }
  }
}


/**
 * @param value
 * @param type
 * @return whether `value` is a JSON value of `type`
 */
function isType(value: unknown, type: JSONSchemaType): boolean {
  switch (type) {
    case 'object': return isPlainObject(value)
    case 'array': return Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return false
  }
}


/**
 * @param value
 * @return the JSON type name of `value`, for messages
 */
function describeType(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}


/**
 * @param value
 * @return true for `{}`-shaped objects (not arrays, null or class instances)
 */
function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
