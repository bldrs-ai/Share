import {navigateToModel, isTempModelPath, homeModelPath, navToDefault, reloadAfterCacheClear} from './navigate'


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
})


describe('isTempModelPath', () => {
  it('is true for uploaded /v/new/ models', () => {
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
