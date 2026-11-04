import {SENTRY_MODEL_LINE_PREFIX, redactBreadcrumb} from './sentryRedaction'


/**
 * A console breadcrumb as Sentry's console integration records it.
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
  // header's FILE_NAME and author text (SHARE-1MT).
  it('withholds the whole model line', () => {
    const crumb = consoleCrumb(
      'Model: \\\\10.0.0.5\\Projects\\ACME Tower\\Bracket rev2.stp — CONFIG_CONTROL_DESIGN, 121.7 MB, ' +
      'CATIA V5 exported by jane@example.com (CATIA V5 STEP AP203 v1)')
    const redacted = redactBreadcrumb(crumb)
    expect(redacted.message).toBe(SENTRY_MODEL_LINE_PREFIX)
    expect(redacted.data.arguments).toEqual([SENTRY_MODEL_LINE_PREFIX])
    expect(JSON.stringify(redacted)).not.toMatch(/10\.0\.0\.5|ACME|Bracket|jane@example\.com/)
    // Everything else about the breadcrumb is kept.
    expect(redacted.level).toBe('info')
    expect(redacted.data.logger).toBe('console')
  })

  // dragAndDrop's warning names the dropped file (test-models#69); the size
  // and the verdict are what triage needs, so they stay.
  it('withholds the dropped file name and keeps the rest of the warning', () => {
    const crumb = consoleCrumb(
      'handleFileDrop: "Jane\'s "final" plan.dwg" (267 bytes) is not a recognized model format', 'warning')
    const redacted = redactBreadcrumb(crumb)
    expect(redacted.message).toBe(
      'handleFileDrop: (file name withheld) (267 bytes) is not a recognized model format')
    expect(JSON.stringify(redacted)).not.toMatch(/Jane|plan\.dwg/)
  })

  it('withholds the name even if the warning\'s wording changes', () => {
    const redacted = redactBreadcrumb(consoleCrumb('handleFileDrop: "secret.rvt" was refused'))
    expect(redacted.message).toBe('handleFileDrop: (file name withheld)')
  })

  it('passes every other breadcrumb through untouched', () => {
    const report = consoleCrumb('Geometry: 24.323s, +776.850690 MB heap')
    expect(redactBreadcrumb(report)).toBe(report)
    // A model line that isn't a console breadcrumb (navigation, fetch) is
    // left alone: only the console echo carries header text.
    const nav = {category: 'navigation', data: {from: '/', to: '/share'}, message: 'Model: x'}
    expect(redactBreadcrumb(nav)).toBe(nav)
    expect(redactBreadcrumb(undefined)).toBe(undefined)
  })
})
