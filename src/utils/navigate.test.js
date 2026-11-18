import {
  navigateToInMemoryModel, navigateToModel, isTempModelPath, homeModelPath, navToDefault, reloadAfterCacheClear,
} from './navigate'
import {enablePageReloadApprovalCheck, handleBeforeUnload} from './event'


describe('navigateToModel', () => {
  let assignCalls
  let locationGetter

  beforeEach(() => {
    assignCalls = []
    const mockLocation = {
      assign: (url) => {
        assignCalls.push(url)
      },
    }
    locationGetter = jest.spyOn(window, 'location', 'get').mockReturnValue(mockLocation)
  })

  afterEach(() => {
    if (locationGetter) {
      locationGetter.mockRestore()
    }
  })

  it('calls window.location.assign in non-test env', () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    navigateToModel('/abc/model.ifc')
    expect(assignCalls).toEqual(['/abc/model.ifc'])
    process.env.NODE_ENV = prevEnv
  })

  it('uses navigate fallback in test env', () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    const navCalls = []
    const fakeNavigate = (p) => navCalls.push(p)
    navigateToModel({pathname: '/p/model.ifc', search: '?q=1', hash: '#h'}, fakeNavigate)
    expect(navCalls).toEqual(['/p/model.ifc?q=1#h'])
    expect(assignCalls).toHaveLength(0)
    process.env.NODE_ENV = prevEnv
  })

  it('throws for invalid target', () => {
    expect(() => navigateToModel(null)).toThrow(/invalid target/)
  })

  describe('carries the current query string forward (feature flags)', () => {
    const prevEnv = process.env.NODE_ENV

    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      locationGetter.mockReturnValue({
        search: '?feature=workspace',
        assign: (url) => assignCalls.push(url),
      })
    })

    afterEach(() => {
      process.env.NODE_ENV = prevEnv
    })

    it('appends the current search to a bare path', () => {
      navigateToModel('/share/v/new/haus.ifc')
      expect(assignCalls).toEqual(['/share/v/new/haus.ifc?feature=workspace'])
    })

    it('inserts the search before an existing hash', () => {
      navigateToModel('/share/v/p/index.ifc#c:1,2,3')
      expect(assignCalls).toEqual(['/share/v/p/index.ifc?feature=workspace#c:1,2,3'])
    })

    it('leaves a target that carries its own search alone', () => {
      navigateToModel({pathname: '/share/v/new/haus.ifc', search: '?feature=bot'})
      expect(assignCalls).toEqual(['/share/v/new/haus.ifc?feature=bot'])
    })
  })

  // open-205 #2021: the flag routes the open through react-router instead of
  // a page load. Outside the test env, so the test-env fallback above can't
  // be what navigates.
  describe('under ?feature=spaModelNav', () => {
    const prevEnv = process.env.NODE_ENV

    beforeEach(() => {
      process.env.NODE_ENV = 'development'
      locationGetter.mockReturnValue({
        search: '?feature=spaModelNav',
        assign: (url) => assignCalls.push(url),
      })
    })

    afterEach(() => {
      process.env.NODE_ENV = prevEnv
    })

    it('navigates in-app, carrying the flag, and loads no page', () => {
      const navigate = jest.fn()
      navigateToModel('/share/v/p/index.ifc#c:1,2,3', navigate)
      expect(navigate).toHaveBeenCalledWith('/share/v/p/index.ifc?feature=spaModelNav#c:1,2,3')
      expect(assignCalls).toHaveLength(0)
    })

    it('still loads the page when no navigate is given', () => {
      navigateToModel('/share/v/p/index.ifc')
      expect(assignCalls).toEqual(['/share/v/p/index.ifc?feature=spaModelNav'])
    })

    // ShareViewer reads `?view=` once, at module load (open-205, #2022).
    it('loads the page for a link that asks for another ?view=, and stays in-app for the same one', () => {
      const navigate = jest.fn()
      navigateToModel('/share/v/p/index.ifc?feature=spaModelNav&view=ifc#c:1', navigate)
      expect(navigate).not.toHaveBeenCalled()
      expect(assignCalls).toEqual(['/share/v/p/index.ifc?feature=spaModelNav&view=ifc#c:1'])
      navigateToModel('/share/v/p/index.ifc?feature=spaModelNav', navigate)
      expect(navigate).toHaveBeenCalledWith('/share/v/p/index.ifc?feature=spaModelNav')
      expect(assignCalls).toHaveLength(1)
    })

    it('disarms the upload guard before navigating', () => {
      const remove = jest.spyOn(window, 'removeEventListener')
      const navigate = jest.fn(() => {
        expect(remove).toHaveBeenCalledWith('beforeunload', handleBeforeUnload)
      })
      navigateToModel('/share/v/p/index.ifc', navigate)
      expect(navigate).toHaveBeenCalled()
      remove.mockRestore()
    })
  })

  it('without the flag, a navigate given outside tests does not stop the page load', () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    locationGetter.mockReturnValue({search: '?feature=workspace', assign: (url) => assignCalls.push(url)})
    const navigate = jest.fn()
    navigateToModel('/share/v/p/index.ifc', navigate)
    expect(navigate).not.toHaveBeenCalled()
    expect(assignCalls).toEqual(['/share/v/p/index.ifc?feature=workspace'])
    process.env.NODE_ENV = prevEnv
  })
})


// A file held only in this page's memory (#1906): a page load would end it,
// so this must be an in-app navigation even outside tests, where
// navigateToModel does a full load.
describe('navigateToInMemoryModel', () => {
  let locationGetter
  const assign = jest.fn()
  const prevEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
    locationGetter = jest.spyOn(window, 'location', 'get').mockReturnValue({search: '?feature=look', assign})
  })

  afterEach(() => {
    process.env.NODE_ENV = prevEnv
    locationGetter.mockRestore()
    assign.mockClear()
  })

  it('navigates in-app, carrying the query string, and never loads a page', () => {
    const navigate = jest.fn()
    navigateToInMemoryModel('/share/v/new/4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc', navigate)
    expect(navigate).toHaveBeenCalledWith('/share/v/new/4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc?feature=look')
    expect(assign).not.toHaveBeenCalled()
  })

  // Loader#load arms the guard for every upload; leaving one in-app has to
  // take it down, as navigateToModel does (#2021).
  it('disarms the upload guard', () => {
    enablePageReloadApprovalCheck()
    const remove = jest.spyOn(window, 'removeEventListener')
    navigateToInMemoryModel('/share/v/new/4be9c3dc-e138-47e9-962b-d0cf55cbbc26.ifc', jest.fn())
    expect(remove).toHaveBeenCalledWith('beforeunload', handleBeforeUnload)
    remove.mockRestore()
  })
})


describe('isTempModelPath', () => {
  it('is true for local-only models, and the legacy /v/new/ route', () => {
    expect(isTempModelPath('/share/v/local-only/AA77535-D1B6-49A9-915B.ifc')).toBe(true)
    expect(isTempModelPath('/Share/share/v/local-only/uuid.ifc')).toBe(true)
    expect(isTempModelPath('/share/v/new/AA77535-D1B6-49A9-915B.ifc')).toBe(true)
    expect(isTempModelPath('/Share/share/v/new/uuid.ifc')).toBe(true)
  })

  it('is false for hosted, github and other routes', () => {
    expect(isTempModelPath('/share/v/p/index.ifc')).toBe(false)
    expect(isTempModelPath('/share/v/gh/org/repo/main/model.ifc')).toBe(false)
    expect(isTempModelPath('')).toBe(false)
    expect(isTempModelPath(undefined)).toBe(false)
  })
})


describe('homeModelPath', () => {
  let locationGetter

  afterEach(() => {
    if (locationGetter) {
      locationGetter.mockRestore()
      locationGetter = null
    }
  })

  it('uses the given appPrefix', () => {
    expect(homeModelPath('/share')).toBe(
      '/share/v/p/index.ifc#c:-57.022,131.828,173.3,37.922,22.64,9.136')
  })

  it('derives the install prefix when appPrefix is omitted', () => {
    locationGetter = jest.spyOn(window, 'location', 'get')
      .mockReturnValue({pathname: '/Share/share/v/new/uuid.ifc'})
    expect(homeModelPath()).toBe(
      '/Share/share/v/p/index.ifc#c:-57.022,131.828,173.3,37.922,22.64,9.136')
  })

  it('carries the current query string forward (feature flags)', () => {
    locationGetter = jest.spyOn(window, 'location', 'get')
      .mockReturnValue({pathname: '/share/v/new/uuid.ifc', search: '?feature=bot'})
    expect(homeModelPath('/share')).toBe(
      '/share/v/p/index.ifc?feature=bot#c:-57.022,131.828,173.3,37.922,22.64,9.136')
  })
})


describe('navToDefault', () => {
  const CAMERA_HASH = '#c:-57.022,131.828,173.3,37.922,22.64,9.136'
  let locationGetter

  afterEach(() => {
    if (locationGetter) {
      locationGetter.mockRestore()
      locationGetter = null
    }
  })

  /**
   * Point `window.location` at a stub for one test.
   *
   * @param {string} search e.g. '?feature=bot'
   * @return {Array<string>} Collector the fake navigate pushes into
   */
  function navCallsWithSearch(search) {
    locationGetter = jest.spyOn(window, 'location', 'get')
      .mockReturnValue({pathname: '/share', search})
    const navCalls = []
    navToDefault((path) => navCalls.push(path), '/share')
    return navCalls
  }

  it('navigates to the home model with the default camera', () => {
    expect(navCallsWithSearch('')).toEqual([`/share/v/p/index.ifc${CAMERA_HASH}`])
  })

  // The gclid bug (#1784) was this query going missing across a redirect;
  // this is the last hop in that chain, and feature flags (`?feature=…`)
  // ride the same query.
  it('carries the current query string forward', () => {
    expect(navCallsWithSearch('?gclid=TEST123&feature=bot')).toEqual([
      `/share/v/p/index.ifc?gclid=TEST123&feature=bot${CAMERA_HASH}`,
    ])
  })

  // Guards the removal of `location.query` — not a DOM property, so always
  // ''. Had it ever resolved, it would have appended a second query here.
  it('appends exactly one query string', () => {
    const [path] = navCallsWithSearch('?feature=bot')
    expect(path.match(/\?/g)).toHaveLength(1)
  })

  // The camera hash was a ternary on window.innerWidth with two identical
  // branches. Both form factors must keep producing the same framing.
  it('uses the same camera on mobile and desktop widths', () => {
    // jsdom exposes innerWidth as a writable data property, not an
    // accessor, so jest.spyOn(..., 'get') can't wrap it — assign directly.
    const realWidth = window.innerWidth
    try {
      window.innerWidth = 1280
      const desktop = navCallsWithSearch('')
      locationGetter.mockRestore()
      window.innerWidth = 390
      const mobile = navCallsWithSearch('')
      expect(mobile).toEqual(desktop)
      expect(mobile).toEqual([`/share/v/p/index.ifc${CAMERA_HASH}`])
    } finally {
      window.innerWidth = realWidth
    }
  })
})


describe('reloadAfterCacheClear', () => {
  let assignCalls
  let reloadCalls
  let locationGetter

  const mockLocation = (pathname, search = '') => {
    assignCalls = []
    reloadCalls = 0
    locationGetter = jest.spyOn(window, 'location', 'get').mockReturnValue({
      pathname,
      search,
      assign: (url) => assignCalls.push(url),
      reload: () => {
        reloadCalls += 1
      },
    })
  }

  afterEach(() => {
    if (locationGetter) {
      locationGetter.mockRestore()
      locationGetter = null
    }
  })

  it('navigates to the home model for a temporary model', () => {
    mockLocation('/share/v/new/uuid.ifc')
    reloadAfterCacheClear('/share')
    expect(assignCalls).toEqual([
      '/share/v/p/index.ifc#c:-57.022,131.828,173.3,37.922,22.64,9.136'])
    expect(reloadCalls).toBe(0)
  })

  it('preserves the query string when navigating home', () => {
    mockLocation('/share/v/new/uuid.ifc', '?feature=bot')
    reloadAfterCacheClear('/share')
    expect(assignCalls).toEqual([
      '/share/v/p/index.ifc?feature=bot#c:-57.022,131.828,173.3,37.922,22.64,9.136'])
    expect(reloadCalls).toBe(0)
  })

  it('reloads in place for a normal model', () => {
    mockLocation('/share/v/p/index.ifc')
    reloadAfterCacheClear('/share')
    expect(assignCalls).toEqual([])
    expect(reloadCalls).toBe(1)
  })
})
