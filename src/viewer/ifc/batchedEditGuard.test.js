import fs from 'fs'
import path from 'path'


/**
 * Static guard for create-300 L0's single mutation API (#1915;
 * design/new/model-edit.md §6.2).
 *
 * `batchedEdit.js` is the only module allowed to change what a LOADED batch
 * holds, because it is the one place that bumps the batch's edit revision and
 * notifies the consumers that derive state from it (highlight, residency, the
 * isolation mask, framing bounds). A change made anywhere else would leave
 * every one of them describing the batch as it was — the bug class four review
 * rounds of #1922 kept finding one cache at a time.
 *
 * What it flags, in every non-test source file under src, outside the
 * allowlist below:
 *
 *  - any mention of a batch mutator's NAME — three's (`addInstance`,
 *    `deleteInstance`, …) and the side tables' row writers. A name, not a
 *    call shape, so destructuring (`const {deleteInstance} = mesh`), bracket
 *    access (`mesh['deleteInstance']`), an alias (`const del =
 *    mesh.deleteInstance`), an optional call (`?.(`) and a call split over
 *    lines are all caught;
 *  - a write to a side table: an element store (`instanceParents[i] = …`), a
 *    mutating Map/array method on one (`occurrencePathToBatchIds.set(…)`),
 *    or replacing the table (`mesh.instanceParents = …`).
 *
 * Comments are stripped first (a real scan, not "skip lines that start with
 * a comment"), so prose citing three's methods is not flagged and code after
 * an inline comment is. String contents are kept, because a bracket access
 * names the method in a string. Regex literals are not parsed; one containing
 * a quote or `//` could confuse the stripper, and nothing in src writes one
 * near these names.
 *
 * The run-time half: `batchedInstanceTables#writeRow` / `clearRow` refuse a
 * loaded batch, so the builders' writers cannot reach one post-load either.
 *
 * Allowlisted, each for a stated reason: `batchedEdit.js` itself, the table
 * owner, the load-time builders (which fill a batch before decoration hands
 * it to any consumer), decoration (which installs the tables), and the two
 * display-colour writers (colour is display state, not identity: no consumer
 * keys anything on it, and they repaint through `repaintBatchedColors`).
 * Test files are not scanned — suites build and break batches on purpose.
 */


const MUTATORS = [
  // three r0.184's BatchedMesh mutators.
  'addInstance', 'deleteInstance', 'setMatrixAt', 'setGeometryIdAt',
  'addGeometry', 'setGeometryAt', 'deleteGeometry', 'optimize',
  'setInstanceCount', 'setGeometrySize',
  // The side tables' writers (batchedInstanceTables.js).
  'writeRow', 'clearRow', 'editWriteRow', 'editClearRow', 'ensureInstanceCapacity',
]

const TABLES = [
  'instanceParents', 'instanceOccurrenceIds', 'instanceGeometryIds',
  'instanceOccurrencePaths', 'instanceColors', 'instanceSourceColors',
  'occurrencePathToBatchIds',
]

const NAME = new RegExp(`\\b(${MUTATORS.join('|')})\\b`, 'g')
const TABLE = TABLES.join('|')
const MUTATING_METHODS = 'set|delete|clear|push|pop|shift|unshift|splice|fill|copyWithin|sort|reverse'
const ELEMENT_WRITE = new RegExp(
  `\\b(${TABLE})\\s*(?:\\[[^\\]\\n]*\\]\\s*=(?!=)|\\.(?:${MUTATING_METHODS})\\s*\\()`, 'g')
const TABLE_REPLACE = new RegExp(`\\.(${TABLE})\\s*=(?!=)`, 'g')

const BUILDER = ['addGeometry', 'addInstance', 'setMatrixAt', 'writeRow']
const write = (name) => `${name} write`

/** File (repo-relative) → names it may mention / tables it may write. */
const ALLOWED = {
  // The API itself (three's mutators; the edit-only row writers; and the
  // BatchEditKind strings, which spell three's method names).
  'src/viewer/ifc/batchedEdit.js': ['addInstance', 'deleteInstance', 'setMatrixAt',
    'setGeometryIdAt', 'addGeometry', 'setInstanceCount', 'editWriteRow', 'editClearRow',
    'ensureInstanceCapacity'],
  // The table owner: defines the writers and stores the rows.
  'src/viewer/ifc/batchedInstanceTables.js': ['writeRow', 'clearRow', 'editWriteRow',
    'editClearRow', 'ensureInstanceCapacity', ...TABLES.filter((t) => t !== 'occurrencePathToBatchIds').map(write)],
  // Buffer growth for `batchedEdit#addBatchedGeometry`; moves no geometry.
  'src/viewer/ifc/batchedGeometryCapacity.js': ['setGeometrySize'],
  // Load-time builders: one-shot, streaming, cache-hit hydration, and the
  // collapsed-range registration hydration calls.
  'src/viewer/ifc/flatMeshToBatchedModel.js': BUILDER,
  'src/viewer/ifc/incrementalBatchedBuilder.js': [...BUILDER, 'setInstanceCount', 'setGeometrySize',
    'ensureInstanceCapacity', ...['instanceParents', 'instanceOccurrenceIds', 'instanceGeometryIds',
      'instanceOccurrencePaths', 'instanceColors'].map(write)],
  'src/viewer/ifc/instancedGlbToBatchedModel.js': BUILDER,
  'src/viewer/ifc/batchedGeometryRanges.js': ['addGeometry'],
  // Decoration installs the tables on the finished batch.
  'src/viewer/ifc/buildBatchedConwayModel.js': TABLES.map(write),
  // Display colour, not identity (module doc).
  'src/viewer/display/colorMode.js': [write('instanceColors')],
  'src/viewer/ifc/productPalette.js': [write('instanceColors')],
  // Test fixture building an artifact's source batch.
  'src/loader/glbArtifact.fixture.js': [...BUILDER.filter((n) => n !== 'writeRow'),
    ...TABLES.filter((t) => t !== 'occurrencePathToBatchIds').map(write)],
}


/**
 * Source with every comment removed (newlines kept, so line numbers hold) and
 * string / template contents kept.
 *
 * @param {string} src
 * @return {string}
 */
function stripComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        i++
      }
    } else if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') {
          out += '\n'
        }
        i++
      }
      i += 2
    } else if (c === '\'' || c === '"' || c === '`') {
      out += c
      i++
      while (i < src.length && src[i] !== c) {
        const take = src[i] === '\\' ? 2 : 1
        out += src.slice(i, i + take)
        i += take
      }
      out += c
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}


/**
 * Every flagged mention in one file's source.
 *
 * @param {string} src
 * @return {Array<{name: string, line: number}>}
 */
function mentionsIn(src) {
  const code = stripComments(src)
  const lineOf = (index) => code.slice(0, index).split('\n').length
  const found = []
  for (const match of code.matchAll(NAME)) {
    found.push({name: match[1], line: lineOf(match.index)})
  }
  for (const pattern of [ELEMENT_WRITE, TABLE_REPLACE]) {
    for (const match of code.matchAll(pattern)) {
      found.push({name: write(match[1]), line: lineOf(match.index)})
    }
  }
  return found
}


/**
 * @param {string} dir absolute
 * @param {Array<string>} out absolute paths of scanned source files
 * @return {Array<string>}
 */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, out)
    } else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}


describe('viewer/ifc/batchedEditGuard', () => {
  const repoRoot = path.resolve(__dirname, '../../..')
  const found = new Map()
  for (const file of sourceFiles(path.join(repoRoot, 'src'))) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/')
    const mentions = mentionsIn(fs.readFileSync(file, 'utf8'))
    if (mentions.length > 0) {
      found.set(rel, mentions)
    }
  }

  it('finds every shape of reaching a mutator, and nothing in comments', () => {
    // The scanner is what every assertion below rests on; prove it bites on
    // each evasion the round-5 review found, and stays quiet on prose.
    const names = (src) => mentionsIn(src).map((m) => m.name)
    expect(names('const id = mesh.addInstance(geometryId)')).toEqual(['addInstance'])
    expect(names('const {deleteInstance} = mesh; deleteInstance.call(mesh, 3)'))
      .toEqual(['deleteInstance', 'deleteInstance'])
    expect(names('mesh[\'deleteInstance\'](3)')).toEqual(['deleteInstance'])
    expect(names('const del = mesh.deleteInstance')).toEqual(['deleteInstance'])
    expect(names('mesh.deleteInstance?.(3)')).toEqual(['deleteInstance'])
    expect(names('/* paste */ mesh.addInstance(g)')).toEqual(['addInstance'])
    expect(mentionsIn('mesh.setMatrixAt\n  (3, m)')).toEqual([{name: 'setMatrixAt', line: 1}])
    expect(names('BatchedMesh.prototype.optimize.call(mesh)')).toEqual(['optimize'])
    expect(names('writeRow(mesh, 3, row)')).toEqual(['writeRow'])
    expect(names('mesh.instanceParents[b] = 7')).toEqual([write('instanceParents')])
    expect(names('mesh.occurrencePathToBatchIds.set(k, [b])')).toEqual([write('occurrencePathToBatchIds')])
    expect(names('mesh.instanceGeometryIds = other')).toEqual([write('instanceGeometryIds')])
    // Reads and look-alikes are not writes or mutators.
    expect(names('if (mesh.instanceParents[b] === 7) { addBatchedInstance(m) }')).toEqual([])
    expect(names('const url = \'http://x\'; mesh.setColorAt(0, c)')).toEqual([])
    // Prose: line and block comments, including after code.
    expect(names('// mesh.addInstance(g)\n/**\n * `deleteInstance` frees no memory\n */')).toEqual([])
    expect(names('x() // then mesh.deleteInstance(3)')).toEqual([])
    expect(names('/*\n mesh.addInstance(g)\n*/ y()')).toEqual([])
  })

  it('reaches a batch\'s mutators and side tables only from batchedEdit, the owner and load', () => {
    const violations = []
    for (const [file, mentions] of found) {
      const allowed = ALLOWED[file] ?? []
      for (const {name, line} of mentions) {
        if (!allowed.includes(name)) {
          violations.push(`${file}:${line} ${name}`)
        }
      }
    }
    // A hit here: route the edit through src/viewer/ifc/batchedEdit.js. A new
    // LOAD-TIME builder goes in ALLOWED above, with the reason.
    expect(violations).toEqual([])
  })

  it('keeps the allowlist no wider than what the files actually do', () => {
    // So a file that stops needing a mutator stops being allowed it.
    const unused = []
    for (const [file, names] of Object.entries(ALLOWED)) {
      const mentioned = new Set((found.get(file) ?? []).map((mention) => mention.name))
      for (const name of names) {
        if (!mentioned.has(name)) {
          unused.push(`${file} ${name}`)
        }
      }
    }
    expect(unused).toEqual([])
  })
})
