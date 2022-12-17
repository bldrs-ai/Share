import {rest} from 'msw'
import {MOCK_COMMENTS, MOCK_ISSUES} from '../utils/GitHub'


const httpOk = 200
const httpNotFound = 404


export const handlers = [
  rest.get('https://api.github.com/repos/:org/:repo/issues', (req, res, ctx) => {
    if (req.params.org !== 'pablo-mayrgundter' || req.params.repo !== 'Share') {
      return res(ctx.status(httpNotFound))
    }

    return res(
        ctx.status(httpOk),
        ctx.json(MOCK_ISSUES.data),
    )
  }),

  rest.get('https://api.github.com/repos/:org/:repo/issues/:issueNumber/comments', (req, res, ctx) => {
    if (req.params.org !== 'pablo-mayrgundter' || req.params.repo !== 'Share' || req.params.issueNumber !== '17') {
      return res(ctx.status(httpNotFound))
    }

    return res(
        ctx.status(httpOk),
        ctx.json(MOCK_COMMENTS.data),
    )
  }),
]
