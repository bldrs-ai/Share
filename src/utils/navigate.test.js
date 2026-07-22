import {navigateToModel, isTempModelPath, homeModelPath, reloadAfterCacheClear} from './navigate'


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
      '/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
  })

  it('derives the install prefix when appPrefix is omitted', () => {
    locationGetter = jest.spyOn(window, 'location', 'get')
      .mockReturnValue({pathname: '/Share/share/v/new/uuid.ifc'})
    expect(homeModelPath()).toBe(
      '/Share/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
  })
})


describe('reloadAfterCacheClear', () => {
  let assignCalls
  let reloadCalls
  let locationGetter

  const mockLocation = (pathname) => {
    assignCalls = []
    reloadCalls = 0
    locationGetter = jest.spyOn(window, 'location', 'get').mockReturnValue({
      pathname,
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
      '/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314'])
    expect(reloadCalls).toBe(0)
  })

  it('reloads in place for a normal model', () => {
    mockLocation('/share/v/p/index.ifc')
    reloadAfterCacheClear('/share')
    expect(assignCalls).toEqual([])
    expect(reloadCalls).toBe(1)
  })
})
