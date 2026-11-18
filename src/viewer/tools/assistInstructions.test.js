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

  it('imports nothing, so the relay can load it under plain Node ESM', () => {
    const source = fs.readFileSync(path.join(__dirname, 'assistInstructions.js'), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})
