import {HTTP_CREATED, HTTP_OK} from '../http'
import {
  closeIssue,
  createIssue,
} from './Issues'


describe('net/github/Issues', () => {
  it('successfully create note as an issue', async () => {
    const res = await createIssue({orgName: 'bldrs-ai', name: 'Share'}, {title: 'title', body: 'body'})
    expect(res.status).toEqual(HTTP_CREATED)
  })

  it('successfully delete the note by closing the issue', async () => {
    const res = await closeIssue({orgName: 'pablo-mayrgundter', name: 'Share'}, 1)
    expect(res.status).toEqual(HTTP_OK)
  })
})
