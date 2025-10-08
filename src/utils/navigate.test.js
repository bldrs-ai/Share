import {navigateToModel} from './navigate'


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
