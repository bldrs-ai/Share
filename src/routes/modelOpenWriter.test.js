import fs from 'fs'
import path from 'path'


/**
 * Static guard for routes/modelOpen.ts's premise (open-205, #2022): an open
 * is one route result from Share.jsx's route effect, because that effect is
 * the store's only `modelPath` writer, and it sets a new route result only
 * when the route names another model. Another writer, one that set a fresh
 * object for the same model, would make every per-open dedupe count it as a
 * new open (the direct-link meter, real_model_open, model_view, the
 * engagement count), and one that kept an object across models would hide
 * opens. So any other `setModelPath` caller, or a direct `modelPath` store
 * write, has to come here and say why.
 *
 * Comments are left in: a mention in prose is rare, and reading it as a hit
 * errs on the safe side.
 */
const SRC = path.join(__dirname, '..')
// The store slice that defines the setter, and the one writer.
const ALLOWED = new Set(['store/RepositorySlice.js', 'Share.jsx'])


/**
 * @param {string} dir
 * @return {Array<string>} source files under dir, tests and specs left out
 */
function sources(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__mocks__' ? [] : sources(full)
    }
    const isSource = /\.(js|jsx|ts|tsx)$/.test(entry.name) &&
      !/\.(test|spec|fixture)\.(js|jsx|ts|tsx)$/.test(entry.name)
    return isSource ? [full] : []
  })
}


describe('routes/modelOpen: Share.jsx is the only modelPath writer', () => {
  it('finds setModelPath called, or modelPath written to the store, nowhere else', () => {
    const offenders = sources(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => {
        const text = fs.readFileSync(path.join(SRC, rel), 'utf8')
        return /setModelPath\s*\(/.test(text) || /setState\(\s*\{[^}]*\bmodelPath\s*:/.test(text)
      })
    expect(offenders).toEqual([])
  })

  it('still sees the one writer it allows', () => {
    expect(fs.readFileSync(path.join(SRC, 'Share.jsx'), 'utf8')).toMatch(/setModelPath\s*\(/)
  })
})
