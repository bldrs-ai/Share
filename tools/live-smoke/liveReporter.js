/**
 * Playwright reporter for the live smoke run: after the run, list every
 * SKIPPED test with its reason and every check a passing test could not
 * make (an `unverified` annotation, `liveSession.ts#noteUnverified`).
 *
 * Playwright's own reporters count skips but bury the reasons in the HTML
 * report. For this harness the reasons ARE the result — "no free account for
 * project webkit", "not applicable on this deploy: no free-export
 * allowance" — so a run without secrets, or against main rather than #1939,
 * must say so on the console and in the GitHub step summary, not just print
 * "12 skipped".
 *
 * Design: design/new/live-browser-smoke.md §"Skip, don't fail".
 */
import {appendFileSync} from 'node:fs'


/** Collects skips and unverified checks; prints them at the end. */
export default class LiveReporter {
  /** */
  constructor() {
    /** @type {Array<{title: string, reason: string}>} */
    this.skipped = []
    /** @type {Array<{title: string, note: string}>} */
    this.unverified = []
    this.counts = {passed: 0, failed: 0, skipped: 0}
  }

  /**
   * @param {object} test Playwright TestCase
   * @param {object} result Playwright TestResult
   */
  onTestEnd(test, result) {
    const title = `[${test.parent.project()?.name ?? '?'}] ${test.titlePath().slice(2).join(' › ')}`
    // Annotations added while the test runs land on the RESULT in newer
    // Playwright and on the test in older; read both, once each.
    const annotations = [...new Set([...(test.annotations || []), ...(result.annotations || [])])]
    if (result.status === 'skipped') {
      this.counts.skipped++
      const skip = annotations.find((a) => a.type === 'skip' || a.type === 'fixme')
      this.skipped.push({title, reason: skip?.description || '(no reason given)'})
    } else if (result.status === 'passed') {
      this.counts.passed++
    } else {
      this.counts.failed++
    }
    const seenNotes = new Set()
    for (const note of annotations.filter((a) => a.type === 'unverified')) {
      if (seenNotes.has(note.description)) {
        continue
      }
      seenNotes.add(note.description)
      this.unverified.push({title, note: note.description || ''})
    }
  }

  /** Print the summary, and append it to the GitHub step summary when there is one. */
  onEnd() {
    const lines = [
      `### Live smoke: ${this.counts.passed} passed, ${this.counts.failed} failed, ${this.counts.skipped} skipped`,
      '',
    ]
    if (this.skipped.length > 0) {
      lines.push('**Skipped** (each with its reason):', '')
      for (const [reason, titles] of groupBy(this.skipped, 'reason')) {
        lines.push(`- ${reason} — ${titles.length} test${titles.length === 1 ? '' : 's'}:`)
        for (const title of titles) {
          lines.push(`  - ${title}`)
        }
      }
      lines.push('')
    }
    if (this.unverified.length > 0) {
      lines.push('**Notes** — checks a test could not make on this deploy, and what it did instead:', '')
      for (const {title, note} of this.unverified) {
        lines.push(`- ${title}: ${note}`)
      }
      lines.push('')
    }
    const text = lines.join('\n')
    process.stdout.write(`\n${text}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
    }
  }

  /** @return {boolean} this reporter writes to stdout */
  printsToStdio() {
    return true
  }
}


/**
 * @param {Array<object>} items
 * @param {string} key
 * @return {Map<string, Array<string>>} key value → titles, in first-seen order
 */
function groupBy(items, key) {
  const groups = new Map()
  for (const item of items) {
    const list = groups.get(item[key]) ?? []
    list.push(item.title)
    groups.set(item[key], list)
  }
  return groups
}
