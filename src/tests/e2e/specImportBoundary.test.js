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
// A re-export loads its module too: `export {a} from '…'`, `export * from '…'`,
// `export * as ns from '…'`, and `export type {A} from '…'` (erased). The
// clause is held to those shapes so `export const …` is never mistaken for one.
const REEXPORT_RE = /\bexport\s+((?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}))\s+from\s+(['"])([^'"\n]+)\2/g
// The package itself or a subpath: 'msw', 'msw/node'. Not 'mswish'.
const MSW_SPECIFIER_RE = /^msw(?:\/.*)?$/


/**
 * The specs the dependency-free shards load. `*.live.spec.ts` is left out
 * to match `testIgnore` in tools/playwright.config.js: the live smoke runs
 * under tools/playwright.live.config.js after a full install, so its specs
 * may import what they like.
 *
 * @param {string} dir
 * @return {string[]} absolute paths of every shard `*.spec.ts` under `dir`
 */
function listSpecs(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listSpecs(full)
    }
    return entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.live.spec.ts') ? [full] : []
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
 * Every module a file loads statically: its imports and its re-exports.
 *
 * @param {string} source
 * @return {Array<{clause: string, specifier: string}>} clause is '' for a bare import
 */
function importsIn(source) {
  const code = stripComments(source)
  return [...code.matchAll(IMPORT_RE), ...code.matchAll(REEXPORT_RE)].map((m) => ({
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
  const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean)
  // `import {} from '…'` binds nothing but still runs the module.
  return names.length > 0 && names.every((s) => /^type\s/.test(s))
}


/**
 * Whether a file loads msw at runtime: a value import, re-export or bare
 * import of it. Type-only ones are erased before Playwright loads the file.
 *
 * @param {string} source
 * @return {boolean}
 */
function importsMswValue(source) {
  return importsIn(source).some(({clause, specifier}) =>
    MSW_SPECIFIER_RE.test(specifier) && !isTypeOnlyImport(clause))
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
  // The scan's own shapes, so a regex change that stops seeing one goes red
  // here rather than letting a real offender through.
  describe('scanner', () => {
    const valueSpecifiers = (source) =>
      importsIn(source).filter(({clause}) => !isTypeOnlyImport(clause)).map(({specifier}) => specifier)

    it('sees value imports and re-exports, and skips type-only ones', () => {
      expect(valueSpecifiers([
        `import {a} from './a'`,
        `import './b'`,
        `import {} from './empty'`,
        `export {c} from './c'`,
        `export * from './d'`,
        `export * as e from './e'`,
        `import type {T} from './t1'`,
        `import {type U} from './t2'`,
        `export type {V} from './t3'`,
        `export const notAReexport = 1`,
        `import type {W} from './t4'`,
      ].join('\n'))).toEqual(['./a', './b', './empty', './c', './d', './e'])
    })

    it('recognizes msw loaded for its value or its side effects', () => {
      expect(importsMswValue(`import {http} from 'msw'`)).toBe(true)
      expect(importsMswValue(`export * from 'msw/node'`)).toBe(true)
      expect(importsMswValue(`import 'msw'`)).toBe(true)
      expect(importsMswValue(`import 'msw/node'`)).toBe(true)
      expect(importsMswValue(`import {} from 'msw'`)).toBe(true)
    })

    it('ignores type-only msw imports and look-alike packages', () => {
      expect(importsMswValue(`import type {HttpHandler} from 'msw'`)).toBe(false)
      expect(importsMswValue(`import {type HttpHandler} from 'msw'`)).toBe(false)
      expect(importsMswValue(`export type {HttpHandler} from 'msw'`)).toBe(false)
      expect(importsMswValue(`import {x} from 'mswish'`)).toBe(false)
    })
  })

  it('no Playwright spec value-imports a msw mock', () => {
    const specs = listSpecs(SRC_ROOT)
    // A scan that found nothing would pass for the wrong reason.
    expect(specs.length).toBeGreaterThan(0)
    expect(specs.some((p) => p.endsWith('.live.spec.ts'))).toBe(false)

    const offenders = []
    for (const specPath of specs) {
      const rel = path.relative(REPO_ROOT, specPath)
      for (const {clause, specifier} of importsIn(fs.readFileSync(specPath, 'utf8'))) {
        if (isTypeOnlyImport(clause)) {
          continue
        }
        if (MSW_SPECIFIER_RE.test(specifier)) {
          offenders.push(`${rel} → '${specifier}' (imports msw directly)`)
          continue
        }
        const target = resolveLocal(path.dirname(specPath), specifier)
        if (!target) {
          continue
        }
        const targetRel = path.relative(REPO_ROOT, target)
        if (isInside(MOCKS_ROOT, target)) {
          offenders.push(`${rel} → '${specifier}' (${targetRel} is under src/__mocks__/)`)
        } else if (importsMswValue(fs.readFileSync(target, 'utf8'))) {
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
