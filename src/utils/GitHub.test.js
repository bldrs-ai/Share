import {
  getDownloadURL,
  parseGitHubRepositoryURL,
  // postIssue,
} from './GitHub'
// import {server} from '../__mocks__/server'
// import {rest} from 'msw'


describe('GitHub', () => {
  describe('parseGitHubRepositoryURL', () => {
    it('throws an error if given a non-qualified URL', () => {
      expect(() => parseGitHubRepositoryURL('hello'))
          .toThrowError('URL must be fully qualified and contain scheme')
    })

    it('bubbles up an error if standard library cannot parse URL', () => {
      expect(() => parseGitHubRepositoryURL('://dotdotdash.com'))
          .toThrowError()
    })

    it('throws an error if given a non-GitHub repository URL', () => {
      expect(() => parseGitHubRepositoryURL('https://notgithub.com/owner/repository'))
          .toThrowError('Not a valid GitHub repository URL')
    })

    it('returns a repository path structure with correct values', () => {
      const actual = parseGitHubRepositoryURL('https://github.com/pablo-mayrgundter/private/blob/main/haus.ifc')
      expect(actual.owner).toEqual('pablo-mayrgundter')
      expect(actual.repository).toEqual('private')
      expect(actual.ref).toEqual('main')
      expect(actual.path).toEqual('haus.ifc')
    })
  })

  describe('getContentsURL', () => {
    it('bubbles up an exception for a non-existent object', async () => {
      try {
        await getDownloadURL({orgName: 'bldrs-ai', name: 'Share'}, 'a-file-that-does-not-exists.txt')
      } catch (e) {
        expect(e.toString()).toMatch('Not Found')
      }
    })

    it('returns a valid download URL', async () => {
      const downloadURL = await getDownloadURL({orgName: 'bldrs-ai', name: 'Share'}, 'README.md')
      expect(downloadURL).toEqual('https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md')
    })

    it('returns expected download URL for a valid object within main branch', async () => {
      const downloadURL = await getDownloadURL({orgName: 'bldrs-ai', name: 'Share'}, 'README.md', 'main')
      expect(downloadURL).toEqual('https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md?token=MAINBRANCHCONTENT')
    })

    it('returns a valid download URL when given a different Git ref', async () => {
      const downloadURL = await getDownloadURL({orgName: 'bldrs-ai', name: 'Share'}, 'README.md', 'a-new-branch')
      expect(downloadURL).toEqual('https://raw.githubusercontent.com/bldrs-ai/Share/main/README.md?token=TESTTOKENFORNEWBRANCH')
    })
  })

  // describe('post to Github', () => {
  //   it('return valid response when an issue is created', async () => {
  //     const issuePayload = {
  //       title: 'note title',
  //       body: 'note body',
  //     }

  //     const httpOk = 200

  //     server.use(
  //         rest.get('https://api.github.com/repos/:org/:repo/issues', (req, res, ctx) => {
  //           return res(
  //               ctx.status(httpOk),
  //           )
  //         }),
  //     )

  //     // const res = await postIssue({orgName: 'bldrs-ai', name: 'Share', issuePayload})
  //     const responseFromPostMethod = {
  //       status: 200,
  //       url: 'https://api.github.com/repos/bldrs-ai/Share/issues',
  //       headers: {'x-powered-by': 'msw'},
  //       data: '',
  //     }
  //     expect(res.status).toEqual(200)
  //   })
  // })
})
