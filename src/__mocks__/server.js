import {rest} from 'msw'
import {setupServer} from 'msw/node'


const mockedRoutes = [
  rest.head('https://raw.githubusercontent.com/org/repo/branch/missing.ifc', async (req, res, ctx) => {
    return res(
        ctx.status(404, 'Not Found'),
    )
  }),

  rest.head('https://raw.githubusercontent.com/org/repo/branch/small.ifc', async (req, res, ctx) => {
    return res(
        ctx.set('content-type', 'text/plain'),
    )
  }),

  rest.get('https://raw.githubusercontent.com/org/repo/branch/small.ifc', async (req, res, ctx) => {
    return res(
        ctx.set('content-type', 'text/plain'),
        ctx.text(''),
    )
  }),

  rest.head('https://raw.githubusercontent.com/org/repo/branch/large.ifc', async (req, res, ctx) => {
    return res(
        ctx.set('content-type', 'text/plain'),
    )
  }),

  rest.get('https://raw.githubusercontent.com/org/repo/branch/large.ifc', async (req, res, ctx) => {
    return res(
        ctx.set('content-type', 'text/plain'),
        ctx.text('version https://git-lfs.github.com/spec/v1\n' +
          'oid sha256:d8eee65d49e66d70281942de273623b178db10db5aef9ea4bf024b558eff885d\n' +
          'size 108229190'),
    )
  }),
]

export const mockedServer = setupServer(...mockedRoutes)
