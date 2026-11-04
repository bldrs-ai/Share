import {formatModelLine} from '@bldrs-ai/conway/src/core/progress_log'
import {SENTRY_MODEL_LINE_PREFIX, consoleFileName, redactBreadcrumb, redactConsoleMessage} from './sentryRedaction'


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
    expect(redactConsoleMessage(line)).toBe('someNewSeam: (file name withheld) (267 bytes) was refused')
    expect(redactBreadcrumb(consoleCrumb(line, 'warning')).message).not.toMatch(/Jane|plan\.dwg/)
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
})
