import fs from 'fs'
import path from 'path'
import {wireToolName} from '../../assist'
import {INSTRUCTION_TOOL_NAMES, shareAssistInstructions, wire} from './assistInstructions'
import {createShareAssistRegistry} from './assistHost'


describe('viewer/tools/assistInstructions', () => {
  // The module restates Assist's wire naming so the hosted relay can import
  // it under plain Node; the two must not drift.
  it.each(INSTRUCTION_TOOL_NAMES)('names %s as Assist puts it on the wire', (name) => {
    expect(wire(name)).toBe(wireToolName(name))
    expect(shareAssistInstructions()).toContain(wireToolName(name))
  })

  it('names only tools Share\'s registry has', () => {
    const registry = createShareAssistRegistry()
    try {
      const names = registry.list().map((tool) => tool.name)
      expect(names).toEqual(expect.arrayContaining([...INSTRUCTION_TOOL_NAMES]))
    } finally {
      registry.dispose()
    }
  })

  // Share#2240: on a STEP circuit board the assistant said the file was
  // "rather than a building or architectural model", because the prompt opened
  // with "building and CAD models". A mocked relay can't show a model obeying a
  // prompt, so these pin the wording that does the work. The hosted relay sends
  // this same text after its preamble (ai-chat.test.js pins that join).
  describe('does not assume an architectural model', () => {
    const text = shareAssistInstructions()

    it('names non-architectural kinds alongside buildings', () => {
      expect(text).toMatch(/3D models of every kind/)
      expect(text).toMatch(/circuit boards/)
      expect(text).toMatch(/meshes and scenes/)
    })

    it('tells the model to infer the kind from the tools and treat any kind as normal', () => {
      expect(text).toMatch(/Don't assume what kind of model is open/)
      expect(text).toMatch(/any kind is normal here/)
    })

    it('describes the spatial tool as a hierarchy for every format, not only sites and storeys', () => {
      expect(text).toMatch(/assembly or scene tree for other formats/)
      expect(text).not.toMatch(/web viewer for building and CAD models/)
      expect(text).not.toMatch(/lists sites, buildings and storeys\./)
    })
  })

  it('imports nothing, so the relay can load it under plain Node ESM', () => {
    const source = fs.readFileSync(path.join(__dirname, 'assistInstructions.js'), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})
