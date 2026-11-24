import {setTag} from '@sentry/react'
import {OpenKind, modelOpenKind, resetModelOpenReportForTest, tagModelOpen} from './reportModelOpen'


jest.mock('@sentry/react', () => ({setTag: jest.fn()}))


describe('utils/reportModelOpen', () => {
  let originalLocation
  const setSearch = (search) => {
    Object.defineProperty(window, 'location', {writable: true, value: {...originalLocation, search}})
  }

  beforeEach(() => {
    originalLocation = window.location
    resetModelOpenReportForTest()
    setTag.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {writable: true, value: originalLocation})
  })

  it('the page\'s first open is `page`, every later one `in_app`, and a reload keeps its open\'s kind', () => {
    const a = {filepath: '/index.ifc'}
    const b = {filepath: '/box.ifc'}
    // A return to A is a new route result, so a new open (routes/modelOpen.ts).
    const aAgain = {filepath: '/index.ifc'}
    expect(modelOpenKind(a)).toBe(OpenKind.PAGE)
    // The same route result again: a theme or view-settings reload.
    expect(modelOpenKind(a)).toBe(OpenKind.PAGE)
    expect(modelOpenKind(b)).toBe(OpenKind.IN_APP)
    expect(modelOpenKind(aAgain)).toBe(OpenKind.IN_APP)
    expect(modelOpenKind(b)).toBe(OpenKind.IN_APP)
  })

  it('no route, no kind', () => {
    expect(modelOpenKind(null)).toBeUndefined()
    expect(modelOpenKind({filepath: '/index.ifc'})).toBe(OpenKind.PAGE)
  })

  it('tags Sentry with the open\'s kind and the page\'s nav mode, closed values only', () => {
    setSearch('')
    expect(tagModelOpen({filepath: '/a/private/name.ifc'})).toBe(OpenKind.PAGE)
    expect(setTag.mock.calls).toEqual([['model_open', 'page'], ['model_nav', 'in-app']])

    setTag.mockClear()
    setSearch('?feature=disableSpaModelNav')
    expect(tagModelOpen({filepath: '/b.ifc'})).toBe(OpenKind.IN_APP)
    expect(setTag.mock.calls).toEqual([['model_open', 'in_app'], ['model_nav', 'page-load:disableSpaModelNav']])
  })

  it('never throws into a load', () => {
    setTag.mockImplementation(() => {
      throw new Error('sentry down')
    })
    try {
      expect(tagModelOpen({filepath: '/a.ifc'})).toBe(OpenKind.PAGE)
    } finally {
      setTag.mockReset()
    }
  })
})
