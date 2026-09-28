import modelIdentity from './modelIdentity'
import {processExternalUrl, processFile} from './routes'
import processGithubParams from './github'


/**
 * @param result a route result that must have parsed
 * @return it, non-null
 */
function parsed<T>(result: T | null): T {
  if (result === null) {
    throw new Error('route did not parse')
  }
  return result
}


describe('routes/modelIdentity', () => {
  const origin = new URL('https://bldrs.ai/share/v/u')

  it('tells apart generic URL models, which have no gitpath or filepath', () => {
    const a = parsed(processExternalUrl(origin, 'https://example.com/a.obj'))
    const b = parsed(processExternalUrl(origin, 'https://example.com/b.obj'))
    expect(modelIdentity(a)).toBe('https://example.com/a.obj')
    expect(modelIdentity(a)).not.toBe(modelIdentity(b))
  })

  it('tells apart Google Drive models by file id', () => {
    const a = parsed(processExternalUrl(origin, 'https://drive.google.com/file/d/AAA/view'))
    const b = parsed(processExternalUrl(origin, 'https://drive.google.com/file/d/BBB/view'))
    expect(modelIdentity(a)).not.toBe(modelIdentity(b))
    expect(modelIdentity(a)).toContain('AAA')
  })

  it('uses the GitHub file for GitHub models', () => {
    const r = processGithubParams(new URL('https://bldrs.ai/share/v/gh'), 'adf/PM.adf',
      {'org': 'bldrs-ai', 'repo': 'test-models', 'branch': 'main', '*': 'adf/PM.adf'})
    expect(modelIdentity(r)).toBe('https://github.com/bldrs-ai/test-models/main/adf/PM.adf')
  })

  it('uses the served path for local and uploaded files', () => {
    const r = processFile(new URL('https://bldrs.ai/share/v/p'), '/index.ifc')
    expect(modelIdentity(r)).toBe('https://bldrs.ai/index.ifc')
  })

  it('falls back to the path fields for a bare model path', () => {
    expect(modelIdentity({filepath: '/index.ifc'}, '/')).toBe('//index.ifc')
    expect(modelIdentity({gitpath: 'https://github.com/o/r/b/f.ifc'})).toBe('https://github.com/o/r/b/f.ifc')
  })
})
