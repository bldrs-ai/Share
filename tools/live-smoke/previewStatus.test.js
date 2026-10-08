import {main, newestPreviewStatus} from './previewStatus.mjs'


const CONTEXT = 'netlify/bldrs-share-prod/deploy-preview'
const URL_OLD = 'https://deploy-preview-1939--bldrs-share-prod.netlify.app'

/**
 * One commit status as GitHub's API returns it.
 *
 * @param {number} id
 * @param {string} state
 * @param {string} updatedAt
 * @param {object} [extra]
 * @return {object}
 */
function status(id, state, updatedAt, extra = {}) {
  return {id, context: CONTEXT, state, updated_at: updatedAt, created_at: updatedAt, target_url: URL_OLD,
    description: `Deploy ${state}`, ...extra}
}


describe('live-smoke/previewStatus', () => {
  it('uses the newest success', () => {
    const statuses = [status(2, 'success', '2026-10-07T12:05:00Z'), status(1, 'pending', '2026-10-07T12:00:00Z')]
    expect(newestPreviewStatus(statuses, CONTEXT)).toEqual({verdict: 'ready', url: URL_OLD, state: 'success', reason: null})
  })

  it('waits when the newest is pending, even with an older success (Codex on #1942)', () => {
    // A redeploy of the same head: the preview URL is a stable alias, so the
    // old success would smoke the PREVIOUS deploy and report it green.
    const statuses = [
      status(3, 'pending', '2026-10-07T13:00:00Z'),
      status(2, 'success', '2026-10-07T12:05:00Z'),
      status(1, 'pending', '2026-10-07T12:00:00Z'),
    ]
    expect(newestPreviewStatus(statuses, CONTEXT)).toEqual({verdict: 'wait', url: null, state: 'pending',
      reason: `${CONTEXT} is pending (Deploy pending)`})
  })

  it('decides by time, not by the order the list arrived in', () => {
    const statuses = [status(2, 'success', '2026-10-07T12:05:00Z'), status(3, 'pending', '2026-10-07T13:00:00Z')]
    expect(newestPreviewStatus(statuses, CONTEXT).verdict).toBe('wait')
  })

  it.each(['failure', 'error'])('refuses when the newest is %s, even with an older success', (state) => {
    const statuses = [status(3, state, '2026-10-07T13:00:00Z'), status(2, 'success', '2026-10-07T12:05:00Z')]
    expect(newestPreviewStatus(statuses, CONTEXT)).toEqual({verdict: 'failed', url: null, state,
      reason: `${CONTEXT} is ${state} (Deploy ${state})`})
  })

  it('waits when the context has no status yet, and ignores other contexts', () => {
    const other = status(9, 'success', '2026-10-07T14:00:00Z', {context: 'netlify/bldrs-share-dev/deploy-preview'})
    expect(newestPreviewStatus([other], CONTEXT)).toEqual({verdict: 'wait', url: null, state: null,
      reason: `no ${CONTEXT} status yet`})
  })

  it('refuses a success with no URL', () => {
    const statuses = [status(2, 'success', '2026-10-07T12:05:00Z', {target_url: null})]
    expect(newestPreviewStatus(statuses, CONTEXT).verdict).toBe('failed')
  })

  describe('CLI', () => {
    const capture = () => {
      const out = []
      return {write: (s) => out.push(s), text: () => out.join('')}
    }

    it('prints the URL and exits 0 when ready, 2 to wait, 1 to refuse', () => {
      const ready = capture()
      expect(main([CONTEXT], JSON.stringify([status(2, 'success', '2026-10-07T12:05:00Z')]), {stdout: ready})).toBe(0)
      expect(ready.text()).toBe(`${URL_OLD}\n`)
      const pending = [status(3, 'pending', '2026-10-07T13:00:00Z'), status(2, 'success', '2026-10-07T12:05:00Z')]
      expect(main([CONTEXT], JSON.stringify(pending), {stdout: capture()})).toBe(2)
      const failed = [status(3, 'failure', '2026-10-07T13:00:00Z'), status(2, 'success', '2026-10-07T12:05:00Z')]
      const out = capture()
      expect(main([CONTEXT], JSON.stringify(failed), {stdout: out})).toBe(1)
      expect(out.text()).toContain('is failure')
    })

    it('accepts `gh api --paginate` output (an object or a page per line), and refuses garbage', () => {
      const description = 'Deploy preview ready] [next'
      const perObject = [status(3, 'pending', '2026-10-07T13:00:00Z', {description}), status(2, 'success', '2026-10-07T12:05:00Z')]
        .map((s) => JSON.stringify(s)).join('\n')
      expect(main([CONTEXT], perObject, {stdout: capture()})).toBe(2)
      const perPage = `${JSON.stringify([status(3, 'pending', '2026-10-07T13:00:00Z')])}\n` +
        `${JSON.stringify([status(2, 'success', '2026-10-07T12:05:00Z')])}`
      expect(main([CONTEXT], perPage, {stdout: capture()})).toBe(2)
      expect(main([CONTEXT], 'not json', {stdout: capture()})).toBe(1)
      expect(main([], '[]', {stdout: capture()})).toBe(1)
    })
  })
})
