import fs from 'fs'
import path from 'path'
import {formatModelLine} from '@bldrs-ai/conway/src/core/progress_log'
import {SENTRY_MODEL_LINE_PREFIX, consoleFileName, redactBreadcrumb, redactConsoleMessage, workerErrorLabel} from './sentryRedaction'


/**
 * A console breadcrumb as @sentry/browser's console integration records it.
 *
 * @param {string} message
 * @param {string} [level]
 * @return {object}
 */
function consoleCrumb(message, level = 'info') {
  return {category: 'console', level, message, data: {arguments: [message], logger: 'console'}}
}


describe('privacy/sentryRedaction', () => {
  // The load report's model line, echoed to the console, carries the
  // header's FILE_NAME and author text (SHARE-1MT). Built by conway's real
  // formatter, so a change to its shape can't slip past the pattern.
  it('withholds the whole model line conway writes', () => {
    const line = formatModelLine({
      fileName: '\\\\10.0.0.5\\Projects\\ACME Tower\\Bracket rev2.stp',
      schema: 'CONFIG_CONTROL_DESIGN',
      byteLength: 127_611_699,
      originatingSystem: 'CATIA V5 exported by jane@example.com',
      preprocessorVersion: 'CATIA V5 STEP AP203 v1',
    })
    expect(line).toMatch(/^Model: .*Bracket rev2\.stp/)
    const redacted = redactBreadcrumb(consoleCrumb(line))
    expect(redacted.message).toBe(SENTRY_MODEL_LINE_PREFIX)
    expect(redacted.data.arguments).toEqual([SENTRY_MODEL_LINE_PREFIX])
    expect(JSON.stringify(redacted)).not.toMatch(/10\.0\.0\.5|ACME|Bracket|jane@example\.com/)
    // Everything else about the breadcrumb is kept.
    expect(redacted.level).toBe('info')
    expect(redacted.data.logger).toBe('console')
  })

  // Any line of the consoleFileName shape is covered, so a new producer that
  // follows the convention needs no pattern of its own.
  it('withholds a file name written through consoleFileName, keeping the rest of the line', () => {
    const name = 'Jane\'s "final" plan.dwg'
    const line = `someNewSeam: ${consoleFileName(name)} (267 bytes) was refused`
    expect(redactConsoleMessage(line)).toBe('someNewSeam: file (name withheld) (267 bytes) was refused')
    expect(redactBreadcrumb(consoleCrumb(line, 'warning')).message).not.toMatch(/Jane|plan\.dwg/)
  })

  // The `file ` marker is what tells a file name from any other quoted text:
  // three.js warns `THREE.Sprite: "Raycaster.camera" needs to be set …`,
  // and Share renders sprites (Infrastructure/PlaceMark.js).
  it('leaves a library warning with quoted text alone', () => {
    const line = 'THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'
    expect(redactConsoleMessage(line)).toBe(line)
  })

  // Sentry's click breadcrumb is the element path as CSS-like text, values
  // unescaped; the recent-files list puts the file name in `title`.
  it('withholds named attribute values from click breadcrumbs', () => {
    const crumb = {
      category: 'ui.click',
      message: 'div.MuiBox-root > p.MuiTypography-root[title="Tower "east" v2.ifc"] > ' +
        'button.MuiIconButton-root[aria-label="Remove model Tower"]',
    }
    const redacted = redactBreadcrumb(crumb)
    expect(redacted.message).toBe('div.MuiBox-root > p.MuiTypography-root[title="(withheld)"] > ' +
      'button.MuiIconButton-root[aria-label="(withheld)"]')
    // An unnamed click is passed through as the same object.
    const plain = {category: 'ui.click', message: 'button.MuiButton-root'}
    expect(redactBreadcrumb(plain)).toBe(plain)
  })

  it('withholds a click value with a newline in it, and an oversized element path whole', () => {
    expect(redactBreadcrumb({category: 'ui.click', message: 'p[title="Sec\nret.ifc"]'}).message)
      .toBe('p[title="(withheld)"]')
    const OVERSIZED = 5000 // past the 4096-char element-path bound
    const huge = {category: 'ui.click', message: `p[title="${'x'.repeat(OVERSIZED)}`}
    expect(redactBreadcrumb(huge).message).toBe('(withheld)')
  })

  it('passes every other breadcrumb through untouched', () => {
    const report = consoleCrumb('Geometry: 24.323s, +776.850690 MB heap')
    expect(redactBreadcrumb(report)).toBe(report)
    // A model line that isn't a console breadcrumb (navigation, fetch) is
    // left alone: only the console echo carries header text.
    const nav = {category: 'navigation', data: {from: '/', to: '/share'}, message: 'Model: x'}
    expect(redactBreadcrumb(nav)).toBe(nav)
    const noMessage = {category: 'console', data: {arguments: [{}]}}
    expect(redactBreadcrumb(noMessage)).toBe(noMessage)
    expect(redactBreadcrumb(undefined)).toBe(undefined)
  })

  // Share#2107: the OPFS worker's text interpolates cache keys, paths and file
  // names; its structured condition is what Sentry keeps.
  describe('OPFS worker errors', () => {
    const SECRET = 'Error getting file handle for /Acme/secret-plan.ifc: NotFoundError'

    it('keeps the condition and status of a worker error line and withholds its text', () => {
      const data = {error: SECRET, condition: 'file-handle', status: 404}
      const line = `${workerErrorLabel(data)} ${data.error}`
      expect(line).toMatch(/secret-plan/)
      const crumb = redactBreadcrumb({...consoleCrumb(line, 'error'), data: {arguments: [workerErrorLabel(data), data.error]}})
      expect(crumb.message).toBe('Error from worker [condition=file-handle status=404]: (details withheld)')
      expect(JSON.stringify(crumb)).not.toMatch(/Acme|secret-plan/)
    })

    it('withholds the text of a worker error with no condition, and of a logged Error', () => {
      expect(redactConsoleMessage(`${workerErrorLabel({})} ${SECRET}`)).toBe('Error from worker: (details withheld)')
      expect(redactConsoleMessage(`Error from worker: Error: ${SECRET}`)).toBe('Error from worker: (details withheld)')
    })

    it('does not let free text in `condition` into the label', () => {
      expect(workerErrorLabel({condition: 'a b: /secret-plan.ifc'})).toBe('Error from worker:')
    })

    it('withholds the loader\'s OPFS fallback warning text', () => {
      // The pattern is tied to the producer: Loader.js must still write this prefix.
      expect(fs.readFileSync(path.join(__dirname, '../loader/Loader.js'), 'utf8')).toContain('`Loader#load: OPFS path failed (${')
      const line = `Loader#load: OPFS path failed (${SECRET}); falling back to direct fetch. The OPFS cache is best-effort`
      const crumb = redactBreadcrumb(consoleCrumb(line, 'warning'))
      expect(crumb.message).toBe('Loader#load: OPFS path failed (details withheld); falling back to direct fetch.')
      expect(JSON.stringify(crumb)).not.toMatch(/Acme|secret-plan/)
    })
  })
})
