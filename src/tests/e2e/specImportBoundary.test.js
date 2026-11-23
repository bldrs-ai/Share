/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import fs from 'node:fs'
import path from 'node:path'


/**
 * Playwright specs may not value-import a mock that imports `msw`, directly
 * or through one local file. The CI Playwright shards install only
 * `@playwright/test` and `http-server`, not Share's dependencies, so a value
 * import that pulls in `msw` makes `playwright test --list` throw
 * `Cannot find package 'msw'` and fails planning for every shard (#2253,
 * #2255). `import type` is erased at transpile, so it is fine. Restate the
 * constant in the spec instead, as BotChat.spec.ts does.
 *
 * This is a static scan. It checks each spec's direct imports, and for a
 * local target whether that file itself imports msw. It does not follow
 * deeper chains, which covers the shape #2253 hit.
 */


const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const SRC_ROOT = path.join(REPO_ROOT, 'src')
const MOCKS_ROOT = path.join(SRC_ROOT, '__mocks__')
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
// `import … from '…'` across lines, or a bare `import '…'`. The clause cannot
// hold quotes, `;`, or parens, so a dynamic `import('…')` does not match.
const IMPORT_RE = /\bimport\s+(?:([^'"`;()]*?)\s+from\s+)?(['"])([^'"\n]+)\2/g
const MSW_IMPORT_RE = /from\s+['"]msw(?:\/[^'"]*)?['"]/


/**
 * @param {string} dir
 * @return {string[]} absolute paths of every `*.spec.ts` under `dir`
 */
function listSpecs(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listSpecs(full)
    }
    return entry.name.endsWith('.spec.ts') ? [full] : []
  })
}


/**
 * Blanks out comments so a commented-out import is not scanned. Line comments
 * are matched only at the start of a line, so `'https://…'` survives.
 *
 * @param {string} source
 * @return {string}
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}


/**
 * @param {string} source
 * @return {Array<{clause: string, specifier: string}>} clause is '' for a bare import
 */
function importsIn(source) {
  return [...stripComments(source).matchAll(IMPORT_RE)].map((m) => ({
    clause: (m[1] ?? '').trim(),
    specifier: m[3],
  }))
}


/**
 * True when every binding is a type: `import type …`, or `import {type A, type B}`.
 * A default, a namespace, or any plain name makes it a value import. A bare
 * import has no clause and is a value import (it runs the module).
 *
 * @param {string} clause
 * @return {boolean}
 */
function isTypeOnlyImport(clause) {
  if (/^type\s/.test(clause)) {
    return true
  }
  const braces = /\{([^}]*)\}/.exec(clause)
  const rest = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim()
  if (!braces || rest !== '') {
    return false
  }
  return braces[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => /^type\s/.test(s))
}


/**
 * @param {string} p
 * @return {boolean}
 */
function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}


/**
 * @param {string} dir
 * @param {string} p
 * @return {boolean} true when `p` is strictly inside `dir`
 */
function isInside(dir, p) {
  const rel = path.relative(dir, p)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}


/**
 * Resolves a relative specifier the way the bundler would for a spec: as the
 * path itself, then with each extension, then as a directory's `index`.
 * Bare package specifiers return null.
 *
 * @param {string} fromDir directory of the importing file
 * @param {string} specifier
 * @return {string|null} absolute path of the file, or null
 */
function resolveLocal(fromDir, specifier) {
  if (!specifier.startsWith('.')) {
    return null
  }
  const base = path.resolve(fromDir, specifier)
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ]
  return candidates.find(isFile) ?? null
}


describe('e2e/specImportBoundary', () => {
  it('no Playwright spec value-imports a msw mock', () => {
    const specs = listSpecs(SRC_ROOT)
    // A scan that found nothing would pass for the wrong reason.
    expect(specs.length).toBeGreaterThan(0)

    const offenders = []
    for (const specPath of specs) {
      const rel = path.relative(REPO_ROOT, specPath)
      for (const {clause, specifier} of importsIn(fs.readFileSync(specPath, 'utf8'))) {
        if (isTypeOnlyImport(clause)) {
          continue
        }
        const target = resolveLocal(path.dirname(specPath), specifier)
        if (!target) {
          continue
        }
        const targetRel = path.relative(REPO_ROOT, target)
        if (isInside(MOCKS_ROOT, target)) {
          offenders.push(`${rel} → '${specifier}' (${targetRel} is under src/__mocks__/)`)
        } else if (MSW_IMPORT_RE.test(stripComments(fs.readFileSync(target, 'utf8')))) {
          offenders.push(`${rel} → '${specifier}' (${targetRel} imports msw)`)
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Playwright specs may not value-import from src/__mocks__/ or from a module that imports msw (#2255).\n` +
        `The CI shards install only @playwright/test, so this crashes \`playwright test --list\` for every shard.\n` +
        `Use \`import type\` for types, or restate the value in the spec. See src/tests/e2e/README.md.\n\n${
          offenders.map((o) => `  ${o}`).join('\n')}`)
    }
  })
})
