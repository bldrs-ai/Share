import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {generate} from './makeIndexStep.mjs'


const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const committed = path.join(repoRoot, 'public', 'index.step')


describe('makeIndexStep', () => {
  it('reproduces the committed public/index.step', () => {
    // The generator is the source; `public/index.step` is a build product
    // that happens to be committed so `/share/v/p/index.step` needs no
    // build step. Nothing else pins the two together: the E2E spec loads
    // the committed bytes, so editing BLOCKS — the tidy-up its own
    // comment warns about — without rerunning the script would leave
    // every check green and the asset stale.
    expect(generate()).toBe(fs.readFileSync(committed, 'utf8'))
  })

  it('emits ASCII only, as Part 21 strings require', () => {
    // ISO 10303-21 restricts string contents to ISO 8859-1 and wants
    // anything outside it escaped as `\X2\....\X0\`. A stray em dash in
    // a header reaches STEP users as mojibake in the first line they
    // read, and fails a strict syntax checker.
    // eslint-disable-next-line no-control-regex
    expect(generate()).not.toMatch(/[^\x00-\x7F]/)
  })
})
