import {
  createComment,
  deleteComment,
} from './Comments'


const httpOK = 200
const httpCreated = 201

describe('net/github/Comments', () => {
  it('successfully create comment', async () => {
    const res = await createComment({orgName: 'cypresstester', name: 'Share'}, 1, {title: 'title', body: 'body'})
    expect(res.status).toEqual(httpCreated)
  })

  it('successfully delete comment', async () => {
    const res = await deleteComment({orgName: 'cypresstester', name: 'Share'}, 1)
    expect(res.status).toEqual(httpOK)
  })
})
