import fs from 'fs'
import path from 'path'


/**
 * Static guard for create-300 L0's single mutation API (#1915;
 * design/new/model-edit.md §6).
 *
 * `batchedEdit.js` is the only module allowed to change what a LOADED batch
 * holds, because it is the one place that bumps the batch's edit revision and
 * notifies the consumers that derive state from it (highlight, residency, the
 * isolation mask, framing bounds). A direct three call anywhere else would
 * mutate the batch silently and leave every one of them describing the batch
 * as it was — the bug class four review rounds of #1922 kept finding one
 * cache at a time. This test fails the build on such a call.
 *
 * The other entries are the load-time builders: they call three's mutators on
 * a batch nothing reads yet, before `decorateBatchMeshes` hands it to the
 * consumers. Adding a file here means arguing the same for it. Test files are
 * not scanned — suites build and break batches on purpose.
 *
 * A textual scan, like `singleThreeInstance.test.js`: it sees `x.addInstance(`
 * and `x.addInstance.call(`, not a computed `x[name](`, which nothing in src
 * writes and review would flag.
 */


const MUTATORS = [
  'addInstance', 'deleteInstance', 'setMatrixAt', 'setGeometryIdAt',
  'addGeometry', 'setGeometryAt', 'deleteGeometry', 'optimize',
  'setInstanceCount', 'setGeometrySize',
]

const BUILDER = ['addGeometry', 'addInstance', 'setMatrixAt']

/** File (repo-relative) → mutators it may call. */
const ALLOWED = {
  // The API itself.
  'src/viewer/ifc/batchedEdit.js': ['addInstance', 'deleteInstance', 'setMatrixAt',
    'setGeometryIdAt', 'addGeometry', 'setInstanceCount'],
  // Buffer growth for `batchedEdit#addBatchedGeometry`; moves no geometry.
  'src/viewer/ifc/batchedGeometryCapacity.js': ['setGeometrySize'],
  // Load-time builders: one-shot, streaming, cache-hit hydration, and the
  // collapsed-range registration hydration calls.
  'src/viewer/ifc/flatMeshToBatchedModel.js': BUILDER,
  'src/viewer/ifc/incrementalBatchedBuilder.js': [...BUILDER, 'setInstanceCount', 'setGeometrySize'],
  'src/viewer/ifc/instancedGlbToBatchedModel.js': BUILDER,
  'src/viewer/ifc/batchedGeometryRanges.js': ['addGeometry'],
  // Test fixture building an artifact's source batch.
  'src/loader/glbArtifact.fixture.js': BUILDER,
}

const CALL = new RegExp(`\\.(${MUTATORS.join('|')})\\s*(\\(|\\.call\\b|\\.apply\\b)`, 'g')


/**
 * The mutator calls on one line of source, ignoring comment lines (the
 * modules above cite three's methods in prose).
 *
 * @param {string} line
 * @return {Array<string>} mutator names called
 */
function callsOn(line) {
  const trimmed = line.trim()
  if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
    return []
  }
  return [...line.matchAll(CALL)].map((match) => match[1])
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
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
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
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const name of callsOn(line)) {
        if (!found.has(rel)) {
          found.set(rel, [])
        }
        found.get(rel).push({name, line: i + 1})
      }
    })
  }

  it('finds a direct mutator call, including through .call', () => {
    // The scanner is what every assertion below rests on; prove it bites.
    expect(callsOn('  const id = mesh.addInstance(geometryId)')).toEqual(['addInstance'])
    expect(callsOn('  native.setMatrixAt.call(mesh, 0, m)')).toEqual(['setMatrixAt'])
    expect(callsOn('  mesh.deleteInstance (3); mesh.optimize()')).toEqual(['deleteInstance', 'optimize'])
    expect(callsOn(' * `addInstance` reuses the lowest freed id (mesh.addInstance())')).toEqual([])
    expect(callsOn('  mesh.setColorAt(0, c); mesh.setVisibleAt(0, true)')).toEqual([])
  })

  it('calls three\'s batch mutators only from batchedEdit and the load-time builders', () => {
    const violations = []
    for (const [file, calls] of found) {
      const allowed = ALLOWED[file] ?? []
      for (const {name, line} of calls) {
        if (!allowed.includes(name)) {
          violations.push(`${file}:${line} ${name}`)
        }
      }
    }
    // A hit here: route the edit through src/viewer/ifc/batchedEdit.js. A new
    // LOAD-TIME builder goes in ALLOWED above, with the reason.
    expect(violations).toEqual([])
  })

  it('keeps the allowlist no wider than what the files actually call', () => {
    // So a builder that stops needing a mutator stops being allowed it.
    const unused = []
    for (const [file, names] of Object.entries(ALLOWED)) {
      const called = new Set((found.get(file) ?? []).map((call) => call.name))
      for (const name of names) {
        if (!called.has(name)) {
          unused.push(`${file} ${name}`)
        }
      }
    }
    expect(unused).toEqual([])
  })
})
