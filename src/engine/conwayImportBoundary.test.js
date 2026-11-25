/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import fs from 'node:fs'
import path from 'node:path'
import {ESLint} from 'eslint'


/**
 * Conway's web-ifc compat surface is named only inside `src/engine`
 * (design/tracks/open-t200/layering.md §4.1, slice 1a): every reader and the
 * loader talk to `Engine` (Engine.js), and `IfcAPI` is the engine adapters'.
 * Held three ways, each proven to fire, because a guard that silently stopped
 * firing looks exactly like a codebase that obeys it:
 *   - the `no-restricted-imports` rule (.eslintrc.cjs), linted on virtual
 *     files through the repo's REAL config, in both directions;
 *   - a grep for a dynamic `import()` of Conway outside `src/engine`, which
 *     the rule does not see;
 *   - `ShareIfcLoader.js` on one parse path: no `engineLoad` fork, and no
 *     `IfcAPI` named.
 */


const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(REPO_ROOT, 'src')
const RULE = 'no-restricted-imports'
// Linting through the full config (TS parser, every plugin) is a cold start.
const LINT_TIMEOUT_MS = 60_000


/**
 * @param {string} dir absolute
 * @return {Array<string>} every source file under it, absolute
 */
function sourceFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}


/**
 * @param {string} rel path from `src/`
 * @return {boolean} whether the rule covers it: production code outside src/engine
 */
function isGuarded(rel) {
  return !rel.startsWith('engine/') && !rel.startsWith('tests/') &&
    !/\.(test|spec|fixture)\./.test(rel) && !rel.includes('__mocks__/')
}


/**
 * @param {string} code
 * @return {string} the code with block and line comments blanked out, so a
 *   comment that cites Conway's class (slice N leaves those) is not code
 */
function withoutComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}


describe('engine/conwayImportBoundary', () => {
  let eslint


  beforeAll(() => {
    // Lint resolves against process.cwd(), the same as `bun run lint`.
    expect(process.cwd(), 'jest must run from the repo root').toBe(REPO_ROOT)
    eslint = new ESLint({cwd: REPO_ROOT})
  })


  /**
   * @param {string} code
   * @param {string} relPath virtual file path, from the repo root
   * @return {Promise<Array<object>>} the rule's messages for that file
   */
  async function ruleMessages(code, relPath) {
    const [result] = await eslint.lintText(code, {filePath: path.join(REPO_ROOT, relPath)})
    // A parse failure would also yield "no messages"; fail on it instead.
    expect(result.messages.filter((m) => m.fatal)).toEqual([])
    return result.messages.filter((m) => m.ruleId === RULE)
  }


  it('rejects a viewer file importing IfcAPI', async () => {
    const messages = await ruleMessages(
      `import {IfcAPI} from '@bldrs-ai/conway/web-ifc'\nexport const api = new IfcAPI()\n`,
      'src/viewer/boundaryFixture.js')
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(/named only in src\/engine/)
  }, LINT_TIMEOUT_MS)


  it('rejects a UI file importing a type code by the deep path', async () => {
    const messages = await ruleMessages(
      `import {IFCWALL} from '@bldrs-ai/conway/src/compat/web-ifc/ifc2x4'\nexport const t = IFCWALL\n`,
      'src/Components/boundaryFixture.jsx')
    expect(messages).toHaveLength(1)
  }, LINT_TIMEOUT_MS)


  it('rejects the loader and the model importing it too, with no exception', async () => {
    const code = `import {IfcAPI} from '@bldrs-ai/conway/web-ifc'\nexport const api = IfcAPI\n`
    expect(await ruleMessages(code, 'src/loader/boundaryFixture.js')).toHaveLength(1)
    expect(await ruleMessages(code, 'src/model/boundaryFixture.js')).toHaveLength(1)
  }, LINT_TIMEOUT_MS)


  it('allows an engine file, a test, and the loader\'s import of Conway\'s logger', async () => {
    const code = `import {IfcAPI} from '@bldrs-ai/conway/web-ifc'\nexport const api = IfcAPI\n`
    expect(await ruleMessages(code, 'src/engine/boundaryFixture.js')).toEqual([])
    expect(await ruleMessages(code, 'src/viewer/boundaryFixture.test.js')).toEqual([])
    expect(await ruleMessages(
      `import Logger from '@bldrs-ai/conway/src/logging/logger'\nexport const l = Logger\n`,
      'src/loader/boundaryFixture.js')).toEqual([])
  }, LINT_TIMEOUT_MS)


  it('finds no dynamic import of Conway outside src/engine, which the rule cannot see', () => {
    const dynamic = /import\(\s*['"`]@bldrs-ai\/conway/
    const offenders = sourceFiles(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter(isGuarded)
      .filter((rel) => dynamic.test(withoutComments(fs.readFileSync(path.join(SRC, rel), 'utf8'))))
    expect(offenders).toEqual([])
    // And the grep can find one: the engine's own two are there.
    const inEngine = sourceFiles(path.join(SRC, 'engine'))
      .filter((file) => dynamic.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.basename(file))
    expect(inEngine).toEqual(expect.arrayContaining(['spawnEngine.js', 'Engine.worker.js']))
  })


  it('ShareIfcLoader#parse runs one path: no engineLoad fork, and no IfcAPI named', () => {
    const code = withoutComments(fs.readFileSync(path.join(SRC, 'loader', 'ShareIfcLoader.js'), 'utf8'))
    expect(code).not.toMatch(/engineLoad\s*[!=]==?\s*null/)
    expect(code).not.toMatch(/\bIfcAPI\b/)
    expect(code).not.toMatch(/parseIfcWithConway/)
  })
})
