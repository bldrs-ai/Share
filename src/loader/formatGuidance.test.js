import fs from 'node:fs'
import path from 'node:path'
import {supportedTypes} from '../Filetype'
import {
  ARCHIVE,
  AUTOCAD,
  CATIA,
  NATIVE_CAD_HELP_PATH,
  NOT_A_MODEL,
  REVIT,
  SOLIDWORKS,
  TEXT_FILE,
  archiveGuidance,
  formatGuidance,
  guidedExtensions,
} from './formatGuidance'
import {uploadExtension} from './unrecognizedFormat'


// The marketing page the help links point into, by the route the static
// export serves it at (marketing/src/app/<route>/page.tsx).
const HELP_PAGE_SOURCE = path.join(
  __dirname, '../../marketing/src/app', NATIVE_CAD_HELP_PATH, 'page.tsx')


describe('loader/formatGuidance', () => {
  // The issue's own wording (Share#2007), so a rewrite of the text is a
  // deliberate edit here too.
  it('guides every Revit extension to IFC export, and away from the .txt', () => {
    for (const ext of ['rvt', 'rfa', 'rte']) {
      expect(formatGuidance(ext)).toBe(REVIT)
    }
    expect(REVIT.header).toBe('Revit file')
    expect(REVIT.lines[0]).toBe('This is a native Revit file. Share can\'t open Revit files directly.')
    expect(REVIT.lines[1]).toBe('In Revit, use File → Export → IFC, then open the .ifc here.')
    expect(REVIT.lines[2]).toMatch(/open the \.ifc, not the \.txt/)
    expect(REVIT.help).toEqual({href: '/help/native-cad-files/#revit', label: 'How to export IFC from Revit'})
  })

  // The key is the alert's `ext`, so what matters is what real names reduce
  // to — including the two double-extension names in the triage sample that
  // read like an IFC, and a gzipped project.
  it('reaches the Revit text from the names users actually pick', () => {
    for (const name of ['Tower.rvt', 'Tower_rev03.IFC.RVT', 'Family.RFA', 'Template.rte', 'Tower.rvt.gz']) {
      expect(formatGuidance(uploadExtension(name))).toBe(REVIT)
    }
  })

  it('guides the rest of the triage sample', () => {
    expect(['dwg', 'dwf', 'dwfx'].map(formatGuidance)).toEqual([AUTOCAD, AUTOCAD, AUTOCAD])
    expect(['sldprt', 'sldasm'].map(formatGuidance)).toEqual([SOLIDWORKS, SOLIDWORKS])
    expect(['catpart', 'catproduct', 'model'].map(formatGuidance)).toEqual([CATIA, CATIA, CATIA])
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'html', 'htm']) {
      expect(formatGuidance(ext)).toBe(NOT_A_MODEL)
    }
    expect(formatGuidance('txt')).toBe(TEXT_FILE)
    expect(['rar', '7z'].map(formatGuidance)).toEqual([ARCHIVE, ARCHIVE])
    // Case comes off in uploadExtension, before the lookup.
    expect(formatGuidance(uploadExtension('Bracket.SLDPRT'))).toBe(SOLIDWORKS)
    expect(formatGuidance(uploadExtension('Engine.CATProduct'))).toBe(CATIA)
  })

  it('falls back to the generic message for anything else', () => {
    // `bin` is the generic case the drop E2E asserts (dropBinaryStl.spec.ts);
    // `zip` is Share#2006's; `none` and `other` are uploadExtension's own.
    for (const ext of ['bin', 'zip', 'ifczip', 'none', 'other', 'gz', '', undefined]) {
      expect(formatGuidance(ext)).toBeNull()
    }
  })

  // The ext comes from the user's file name; a plain-object map would answer
  // these with Object.prototype's members. Through uploadExtension only
  // `constructor` survives (it lowercases, and drops `_` and anything over 12
  // characters), so the rest are asked directly.
  it('is not fooled by an extension that names an Object.prototype member', () => {
    expect(uploadExtension('a.constructor')).toBe('constructor')
    expect(formatGuidance(uploadExtension('a.constructor'))).toBeNull()
    for (const ext of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(formatGuidance(ext)).toBeNull()
    }
  })

  // Guidance says "Share can't open this". Once a format gains a loader its
  // entry has to go, or the dialog would contradict a file that opens.
  it('guides no extension Share opens', () => {
    expect(guidedExtensions().filter((ext) => supportedTypes.includes(ext))).toEqual([])
  })

  it('lists every supported extension in the not-a-model text', () => {
    for (const ext of supportedTypes) {
      expect(NOT_A_MODEL.lines.join(' ')).toContain(`.${ext}`)
    }
  })

  it('gives every entry a header and at least what-it-is and what-to-do', () => {
    const entries = new Set(guidedExtensions().map(formatGuidance))
    expect(entries.size).toBe(7)
    for (const g of entries) {
      expect(g.header).toMatch(/\S/)
      expect(g.lines.length).toBeGreaterThanOrEqual(2)
    }
  })

  // Share#2006: a zip Share looked inside and found no model in.
  describe('archiveGuidance', () => {
    it('says what the archive holds, then what Share opens', () => {
      const guidance = archiveGuidance({exts: ['pdf', 'png']})
      expect(guidance.header).toBe('No model in this archive')
      expect(guidance.lines[0]).toBe('This archive has no model Share can open (it contains .pdf and .png).')
      expect(guidance.lines[1]).toBe(NOT_A_MODEL.lines[1])
      expect(guidance.help).toBe(NOT_A_MODEL.help)
    })

    it('counts the rest past six types, and names files with no extension', () => {
      const exts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', '']
      expect(archiveGuidance({exts}).lines[0]).toBe(
        'This archive has no model Share can open (it contains .a, .b, .c, .d, .e, .f, ' +
        '2 other file types and files with no extension).')
      expect(archiveGuidance({exts: ['']}).lines[0]).toBe(
        'This archive has no model Share can open (it contains files with no extension).')
    })

    it('gives a zipped native file that format\'s own way out', () => {
      const guidance = archiveGuidance({exts: ['pdf', 'rvt']})
      expect(guidance.lines).toEqual([
        'This archive has no model Share can open (it contains .pdf and .rvt).',
        REVIT.lines[1],
      ])
      expect(guidance.help).toBe(REVIT.help)
      // The issue's own example: a .dwg is AutoCAD's.
      expect(archiveGuidance({exts: ['dwg', 'pdf']}).lines).toEqual([
        'This archive has no model Share can open (it contains .dwg and .pdf).',
        AUTOCAD.lines[1],
      ])
    })

    it('says an empty archive is empty, and passes a reading problem through', () => {
      expect(archiveGuidance({exts: []})).toEqual({header: 'Empty archive', lines: ['This archive is empty.']})
      expect(archiveGuidance({problem: 'This archive is password-protected.'})).toEqual(
        {header: 'Can\'t open this archive', lines: ['This archive is password-protected.']})
    })
  })

  // The links are only as good as the page behind them. The marketing site
  // isn't built for Jest or Playwright (SKIP_MARKETING), so this is the check
  // that each anchor the dialog links to is a section on that page.
  describe('help page', () => {
    const source = fs.readFileSync(HELP_PAGE_SOURCE, 'utf8')
    const hrefs = [...new Set(guidedExtensions().map(formatGuidance).filter((g) => g.help).map((g) => g.help.href))]

    it('has a section for every anchor the guidance links to', () => {
      expect(hrefs.length).toBeGreaterThanOrEqual(5)
      for (const href of hrefs) {
        const [page, anchor] = href.split('#')
        expect(page).toBe(NATIVE_CAD_HELP_PATH)
        expect(source).toContain(`id="${anchor}"`)
      }
    })

    it('names every format Share opens', () => {
      for (const ext of supportedTypes) {
        expect(source).toMatch(new RegExp(`\\.${ext}\\b`))
      }
    })
  })
})
