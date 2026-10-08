import {LIVE_NETLIFY_PROJECTS, LIVE_PRODUCTION_ORIGINS, checkLiveTarget} from './targets.js'
import {main} from './checkTarget.mjs'


describe('live-smoke/targets', () => {
  const outsideCI = {isCI: false}
  const inCI = {isCI: true}

  it('allows a deploy preview of an allowed Netlify project, in and out of CI', () => {
    expect(LIVE_NETLIFY_PROJECTS).toEqual(['bldrs-share-prod', 'bldrs-share-dev'])
    for (const project of LIVE_NETLIFY_PROJECTS) {
      const url = `https://deploy-preview-1939--${project}.netlify.app/`
      for (const options of [outsideCI, inCI]) {
        expect(checkLiveTarget(url, options)).toEqual({
          origin: `https://deploy-preview-1939--${project}.netlify.app`, isLocal: false, problem: null,
        })
      }
    }
  })

  it('allows the production origin', () => {
    expect(LIVE_PRODUCTION_ORIGINS).toContain('https://bldrs.ai')
    expect(checkLiveTarget('https://bldrs.ai', inCI).origin).toBe('https://bldrs.ai')
  })

  it('refuses any other https origin: secrets would follow the run there', () => {
    for (const url of [
      'https://evil.example',
      'https://deploy-preview-1939--attacker-site.netlify.app',
      'https://deploy-preview-1939--bldrs-share-prod.netlify.app.evil.example',
      'https://bldrs.ai.evil.example',
      'https://evil.bldrs.ai',
      'https://deploy-preview-x--bldrs-share-prod.netlify.app',
    ]) {
      expect(checkLiveTarget(url, inCI).problem).toMatch(/is not an allowed live smoke target/)
      expect(checkLiveTarget(url, inCI).origin).toBeNull()
    }
  })

  it('refuses a path, a query, credentials, a port, or http, on an allowed host', () => {
    for (const url of [
      'https://bldrs.ai/share/v/p/index.ifc',
      'https://bldrs.ai/?feature=export',
      'https://user:pw@bldrs.ai',
      'https://bldrs.ai:8443',
      'http://bldrs.ai',
      'http://deploy-preview-1939--bldrs-share-prod.netlify.app',
    ]) {
      expect(checkLiveTarget(url, inCI).origin).toBeNull()
      expect(checkLiveTarget(url, inCI).problem).toMatch(/\S/)
    }
  })

  it('allows localhost only outside CI', () => {
    expect(checkLiveTarget('http://localhost:9081', outsideCI))
      .toEqual({origin: 'http://localhost:9081', isLocal: true, problem: null})
    expect(checkLiveTarget('http://127.0.0.1:8080/', outsideCI).isLocal).toBe(true)
    expect(checkLiveTarget('http://localhost:9081', inCI).problem).toMatch(/not allowed in CI/)
  })

  it('says what is wrong with something that is not a URL', () => {
    expect(checkLiveTarget('bldrs.ai', outsideCI).problem).toBe('LIVE_BASE_URL is not a URL: bldrs.ai')
  })

  describe('checkTarget CLI', () => {
    const capture = () => {
      const out = []
      return {write: (s) => out.push(s), text: () => out.join('')}
    }

    it('prints the origin and exits 0 for an allowed target', () => {
      const stdout = capture()
      expect(main(['https://bldrs.ai/'], {CI: 'true'}, {stdout, stderr: capture()})).toBe(0)
      expect(stdout.text()).toBe('https://bldrs.ai\n')
    })

    it('exits 1 for anything else, CI meaning no localhost', () => {
      const stderr = capture()
      expect(main(['https://evil.example'], {CI: 'true'}, {stdout: capture(), stderr})).toBe(1)
      expect(stderr.text()).toContain('is not an allowed live smoke target')
      expect(main(['http://localhost:9081'], {CI: 'true'}, {stdout: capture(), stderr: capture()})).toBe(1)
      expect(main([], {}, {stdout: capture(), stderr: capture()})).toBe(1)
    })
  })
})
