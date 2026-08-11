import fs from 'fs'
import path from 'path'
import {SAMPLE_MODELS, sampleFormat, thumbnailUrl} from './sampleModelRoster'


describe('sampleModelRoster', () => {
  it('every sample has a generated thumbnail', () => {
    // Thumbnails are static assets under public/, not bundled imports, so
    // nothing fails the build when one is missing — the card would just
    // render a broken image. This is that guard: add a sample, run
    // tools/thumbnails/generate.mjs, or this fails.
    const missing = SAMPLE_MODELS.filter((model) => {
      const url = thumbnailUrl(model.name)
      const file = path.join(__dirname, '../../..', 'public', url)

      return !fs.existsSync(file)
    })

    expect(missing.map((m) => m.name)).toEqual([])
  })

  it('derives a format badge for every sample', () => {
    for (const model of SAMPLE_MODELS) {
      expect(sampleFormat(model.path)).not.toEqual('')
    }
  })

  it('ignores the camera hash when deriving the format', () => {
    expect(sampleFormat('/share/v/gh/o/r/main/a.ifc#c:1,2,3,4,5,6')).toEqual('IFC')
    expect(sampleFormat('/share/v/gh/o/r/main/a.step')).toEqual('STEP')
  })

  it('badges .stp and .step identically — they are one format', () => {
    expect(sampleFormat('/share/v/gh/o/r/main/a.stp')).toEqual('STEP')
    expect(sampleFormat('/share/v/gh/o/r/main/a.step')).toEqual('STEP')
  })

  it('has unique sample names, since they key the thumbnail files', () => {
    const names = SAMPLE_MODELS.map((m) => m.name)

    expect(new Set(names).size).toEqual(names.length)
  })
})
