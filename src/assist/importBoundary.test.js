/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import path from 'node:path'
import {ESLint} from 'eslint'


/**
 * The Assist import fence (.eslintrc.cjs, the `src/assist` zone of
 * `import/no-restricted-paths`; ai-workspace.md §2.1, D15) is what keeps
 * `src/assist/` liftable into its own repo. A lint rule that silently stops
 * firing looks exactly like a codebase that obeys it, so this lints virtual
 * files through the repo's REAL config and asserts both directions: an
 * Assist file importing Share is an error, and the imports Assist is allowed
 * (itself, packages) and the direction hosts use (Share importing Assist) are
 * not.
 */


const REPO_ROOT = path.resolve(__dirname, '..', '..')
const RULE = 'import/no-restricted-paths'
// Linting through the full config (TS parser, every plugin) is a cold start.
const LINT_TIMEOUT_MS = 60_000


describe('assist/importBoundary', () => {
  let eslint


  beforeAll(() => {
    // The zones are resolved against process.cwd() (the rule's default
    // basePath), the same as when `yarn lint` runs; a different cwd would
    // test a different fence than CI enforces.
    expect(process.cwd(), 'jest must run from the repo root').toBe(REPO_ROOT)
    eslint = new ESLint({cwd: REPO_ROOT})
  })


  /**
   * @param {string} code
   * @param {string} relPath virtual file path, from the repo root
   * @return {Promise<Array<object>>} the fence's messages for that file
   */
  async function fenceMessages(code, relPath) {
    const [result] = await eslint.lintText(code, {filePath: path.join(REPO_ROOT, relPath)})
    // A parse failure would also yield "no fence messages"; fail on it instead.
    const fatal = result.messages.filter((m) => m.fatal)
    expect(fatal).toEqual([])
    return result.messages.filter((m) => m.ruleId === RULE)
  }


  it('rejects an Assist TS module importing Share', async () => {
    const messages = await fenceMessages(
      `import useStore from '../store/useStore'\nexport const s = useStore\n`,
      'src/assist/boundaryFixture.ts')
    expect(messages).toHaveLength(1)
    expect(messages[0].message).toMatch(/src\/assist must not import from outside src\/assist/)
  }, LINT_TIMEOUT_MS)


  it('rejects an Assist JS module importing Share, and a dynamic import', async () => {
    const messages = await fenceMessages(
      `import {flags} from '../FeatureFlags'\n` +
      `export const f = flags\n` +
      `export const lazy = () => import('../viewer/visibilityRefs')\n`,
      'src/assist/boundaryFixture.js')
    expect(messages.map((m) => m.line)).toEqual([1, 3])
  }, LINT_TIMEOUT_MS)


  it('allows Assist to import itself and packages', async () => {
    const messages = await fenceMessages(
      `import React from 'react'\n` +
      `import {ToolError} from './errors'\n` +
      `import {createRegistry} from './index'\n` +
      `export const all = [React, ToolError, createRegistry]\n`,
      'src/assist/boundaryFixture.ts')
    expect(messages).toEqual([])
  }, LINT_TIMEOUT_MS)


  it('allows a host to import Assist', async () => {
    const messages = await fenceMessages(
      `import {createRegistry} from '../../assist'\nexport const r = createRegistry\n`,
      'src/viewer/tools/boundaryFixture.js')
    expect(messages).toEqual([])
  }, LINT_TIMEOUT_MS)
})
