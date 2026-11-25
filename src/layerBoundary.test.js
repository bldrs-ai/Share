/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import fs from 'node:fs'
import path from 'node:path'
import {ESLint} from 'eslint'
import ts from 'typescript'
import allowlist from '../tools/lint/layerAllowlist.json'
import {layerOf, LAYERS} from '../tools/lint/layers.cjs'


/**
 * The layer rule (tools/lint/layers.cjs; design/tracks/open-t200/layering.md
 * §5): six layers, each importing only from those below, held by
 * `import/no-restricted-paths` zones with an allowlist of the upward imports
 * still to remove. Two halves:
 *
 *  1. **The allowlist is current.** Every pair in layerAllowlist.json is still
 *     an import its file makes, and still upward. A slice that removes an
 *     import deletes its entry in the same PR, so the list only shrinks
 *     (tools/lint/checkLayerAllowlist.mjs stops it growing).
 *  2. **The rule fires.** Virtual files linted through the repo's REAL config,
 *     as src/assist/importBoundary.test.js does for the Assist fence. A rule
 *     that silently stopped firing would look exactly like a codebase that
 *     obeys it.
 */


const REPO_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(REPO_ROOT, 'src')
const RULE = 'import/no-restricted-paths'
const LAYERING = /layering \(design\/tracks\/open-t200\/layering\.md\)/
// Linting through the full config (TS parser, every plugin) is a cold start.
const LINT_TIMEOUT_MS = 60_000
const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '/index.js', '/index.ts']
const RANK = Object.fromEntries(LAYERS.map(([name], i) => [name, i]))


/**
 * @param {string} srcRel a path under src/
 * @return {number} its layer's rank; the UI is above every listed layer
 */
function rank(srcRel) {
  const layer = layerOf(srcRel)
  return layer === null ? LAYERS.length : RANK[layer]
}


/**
 * Every repo-relative file a source file imports, by the same reading the
 * count in layering.md §3 used (TypeScript's preProcessFile: static and
 * dynamic imports, `export … from`, `require`).
 *
 * @param {string} repoRel e.g. 'src/loader/Loader.js'
 * @return {Array<string>} repo-relative paths it imports that resolve
 */
function importsOf(repoRel) {
  const text = fs.readFileSync(path.join(REPO_ROOT, repoRel), 'utf8')
  const {importedFiles} = ts.preProcessFile(text, true, true)
  const out = []
  for (const {fileName} of importedFiles) {
    if (!fileName.startsWith('.')) {
      continue
    }
    const base = path.posix.join(path.posix.dirname(repoRel), fileName)
    const hit = EXTS.map((e) => base + e).find((p) => fs.existsSync(path.join(REPO_ROOT, p)) &&
      fs.statSync(path.join(REPO_ROOT, p)).isFile())
    if (hit) {
      out.push(hit)
    }
  }
  return out
}


describe('layerBoundary: the layer table', () => {
  it('is the table layering.md §5 specifies', () => {
    // Widening a layer silences violations without touching the allowlist,
    // which the ratchet would not see; so changing the table is a test edit
    // too, made in the doc's slice that decides it.
    expect(LAYERS).toEqual([
      ['base', ['utils', 'privacy', 'routes', 'net', 'OPFS', 'search', 'FeatureFlags.js', 'Filetype.js']],
      ['engine', ['engine']],
      ['model', ['model']],
      ['loader', ['loader']],
      ['session', ['session', 'workspace']],
      ['viewer', ['viewer']],
    ])
  })
})


describe('layerBoundary: the allowlist', () => {
  const pairs = Object.entries(allowlist).flatMap(([file, imports]) => imports.map((imp) => [file, imp]))

  it('names files that exist', () => {
    expect(Object.keys(allowlist).filter((file) => !fs.existsSync(path.join(REPO_ROOT, file)))).toEqual([])
  })

  it('lists only imports the source still makes (a stale entry fails)', () => {
    // An entry here: its import has gone. Delete the entry in the same PR.
    const stale = pairs.filter(([file, imp]) => !importsOf(file).includes(imp))
    expect(stale).toEqual([])
  })

  it('lists only upward imports', () => {
    const toSrc = (p) => path.posix.relative('src', p)
    const notUpward = pairs.filter(([file, imp]) => rank(toSrc(imp)) <= rank(toSrc(file)))
    expect(notUpward).toEqual([])
  })

  it('lists each file and each import once, in order', () => {
    const files = Object.keys(allowlist)
    expect(files).toEqual([...files].sort())
    for (const imports of Object.values(allowlist)) {
      expect(imports).toEqual([...new Set(imports)].sort())
    }
  })

  it('reads the src it checks', () => {
    // The guard is vacuous if the reader finds nothing: Loader.js imports the
    // store today (allowlisted until slice 3a).
    expect(importsOf('src/loader/Loader.js')).toContain('src/store/useStore.js')
    expect(fs.existsSync(SRC)).toBe(true)
  })
})


describe('layerBoundary: the rule fires', () => {
  let eslint


  beforeAll(() => {
    // The zones are resolved against process.cwd() (the rule's default
    // basePath), as when `bun run lint` runs.
    expect(process.cwd(), 'jest must run from the repo root').toBe(REPO_ROOT)
    eslint = new ESLint({cwd: REPO_ROOT})
  })


  /**
   * @param {string} code
   * @param {string} relPath virtual file path, from the repo root
   * @return {Promise<Array<object>>} the rule's messages for that file
   */
  async function zoneMessages(code, relPath) {
    const [result] = await eslint.lintText(code, {filePath: path.join(REPO_ROOT, relPath)})
    const fatal = result.messages.filter((m) => m.fatal)
    expect(fatal).toEqual([])
    return result.messages.filter((m) => m.ruleId === RULE)
  }


  it('rejects an engine file importing the loader', async () => {
    const messages = await zoneMessages(
      `import {load} from '../loader/Loader'\nexport const l = load\n`,
      'src/engine/layerFixture.js')
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(LAYERING)
    expect(messages[0].message).toMatch(/engine may import only base, engine$/)
  }, LINT_TIMEOUT_MS)

  it('rejects a model file importing the viewer, and a dynamic import of it', async () => {
    const messages = await zoneMessages(
      `import ShareViewer from '../viewer/ShareViewer'\n` +
      `export const v = ShareViewer\n` +
      `export const lazy = () => import('../viewer/hoverPick')\n`,
      'src/model/layerFixture.js')
    expect(messages.map((m) => m.line)).toEqual([1, 3])
    expect(messages[0].message).toMatch(LAYERING)
  }, LINT_TIMEOUT_MS)

  it('rejects a src/workspace file importing the store', async () => {
    const messages = await zoneMessages(
      `import useStore from '../store/useStore'\nexport const s = useStore\n`,
      'src/workspace/layerFixture.ts')
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(/session may import only base, engine, model, loader, session$/)
  }, LINT_TIMEOUT_MS)

  it('allows src/session and src/workspace to import each other', async () => {
    const messages = await zoneMessages(
      `import {loadWorkspace} from '../workspace/persistence'\nexport const w = loadWorkspace\n`,
      'src/session/layerFixture.js')
    expect(messages).toEqual([])
  }, LINT_TIMEOUT_MS)

  it('allows a downward import: the loader importing the model', async () => {
    const messages = await zoneMessages(
      `import {decorateShareModel} from '../model/ShareModel'\nexport const d = decorateShareModel\n`,
      'src/loader/layerFixture.js')
    expect(messages).toEqual([])
  }, LINT_TIMEOUT_MS)

  it('excepts an allowlisted pair, and only that pair', async () => {
    const file = 'src/engine/engineModelLoad.js'
    expect(allowlist[file]).toEqual(['src/loader/loadProgress.js'])
    const allowed = `import {getLoadReporter} from '../loader/loadProgress'\nexport const r = getLoadReporter\n`
    expect(await zoneMessages(allowed, file)).toEqual([])
    // The same file importing a second upward module.
    const second = await zoneMessages(
      `${allowed}import {load} from '../loader/Loader'\nexport const l = load\n`, file)
    expect(second.map((m) => m.line)).toEqual([3])
    // Another file making the allowlisted import.
    expect(await zoneMessages(allowed, 'src/engine/layerFixture.js')).toHaveLength(1)
  }, LINT_TIMEOUT_MS)

  it('leaves a test reaching up alone', async () => {
    const messages = await zoneMessages(
      `import useStore from '../store/useStore'\nexport const s = useStore\n`,
      'src/engine/layerFixture.test.js')
    expect(messages).toEqual([])
  }, LINT_TIMEOUT_MS)

  it('bans from below a UI directory the table never lists', async () => {
    // The UI is whatever is left (layers.cjs), so `src/theme/` needs no entry.
    const messages = await zoneMessages(
      `import theme from '../theme/Theme'\nexport const t = theme\n`,
      'src/loader/layerFixture.js')
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(/loader may import only base, engine, model, loader$/)
  }, LINT_TIMEOUT_MS)

  it('keeps the Assist fence after the layer overrides', async () => {
    const messages = await zoneMessages(
      `import useStore from '../store/useStore'\nexport const s = useStore\n`,
      'src/assist/layerFixture.ts')
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(/src\/assist must not import from outside src\/assist/)
  }, LINT_TIMEOUT_MS)
})
