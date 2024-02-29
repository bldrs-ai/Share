import {
  closeIssue,
  createIssue,
} from './Issues'


const httpOK = 200
const httpCreated = 201

describe('net/github/Issues', () => {
  it('successfully create note as an issue', async () => {
    const res = await createIssue({orgName: 'bldrs-ai', name: 'Share'}, {title: 'title', body: 'body'})
    expect(res.status).toEqual(httpCreated)
  })

  it('successfully delete the note by closing the issue', async () => {
    const res = await closeIssue({orgName: 'pablo-mayrgundter', name: 'Share'}, 1)
    expect(res.status).toEqual(httpOK)
  })
})
