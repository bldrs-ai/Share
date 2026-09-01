import {execFileSync} from 'node:child_process'


// If the skip is broken this would start a Next.js install; fail fast
// rather than wait for that.
const SKIP_MUST_RETURN_MS = 5000


describe('marketing build', () => {
  it('exits immediately when SKIP_MARKETING=true', () => {
    const stdout = execFileSync('node', ['tools/marketing/build.js'], {
      encoding: 'utf8',
      env: {...process.env, SKIP_MARKETING: 'true'},
      timeout: SKIP_MUST_RETURN_MS,
    })
    expect(stdout).toContain('marketing: skipped')
  })
})
