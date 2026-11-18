/* eslint-disable no-magic-numbers */
import {zipSync} from 'three/examples/jsm/libs/fflate.module.js'
import {isUnusableOpfsSource} from './opfsSourceHealth'


describe('loader/opfsSourceHealth', () => {
  const ifcText = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
  const ifcBytes = new TextEncoder().encode(ifcText)

  it('evicts an empty source, and a part-21 one cut short of its footer', async () => {
    expect(await isUnusableOpfsSource(new Blob([]), 'obj')).toBe(true)
    expect(await isUnusableOpfsSource(new Blob([ifcText.slice(0, 30)]), 'ifc')).toBe(true)
    expect(await isUnusableOpfsSource(new Blob([ifcText]), 'ifc')).toBe(false)
  })

  // A renamed .ifczip whose entry is STORED (not deflated): the IFC's header
  // is in the zip's head and its directory is the tail, which reads as a
  // part-21 file missing its footer. It is opened by its content later.
  it('keeps a zip under a part-21 name, which only looks truncated', async () => {
    const stored = zipSync({'Tower.ifc': [ifcBytes, {level: 0}]})
    expect(new TextDecoder().decode(stored.slice(0, 200))).toContain('ISO-10303-21')
    expect(await isUnusableOpfsSource(new Blob([stored]), 'ifc')).toBe(false)
  })
})
