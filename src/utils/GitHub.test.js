import {supportedTypes} from '../Filetype'
import {
  MOCK_FILES,
  MOCK_REPOSITORY,
  closeIssue,
  commitFile,
  createComment,
  createIssue,
  deleteComment,
  getDownloadURL,
  getFiles,
  getFilesAndFolders,
  getLatestCommitHash,
  getOrganizations,
  getRepositories,
  githubUrlOrPathToSharePath,
  looksLikeLink,
  parseGitHubRepositoryURL,
  trimToPath,
} from './GitHub'


const httpOK = 200
const httpCreated = 201


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

  describe('post to github', () => {
    it('successfully create note as an issue', async () => {
      const res = await createIssue({orgName: 'bldrs-ai', name: 'Share'}, {title: 'title', body: 'body'})
      expect(res.status).toEqual(httpCreated)
    })

    it('successfully delete the note by closing the issue', async () => {
      const res = await closeIssue({orgName: 'pablo-mayrgundter', name: 'Share'}, 1)
      expect(res.status).toEqual(httpOK)
    })

    it('successfully create comment', async () => {
      const res = await createComment({orgName: 'bldrs-ai', name: 'Share'}, 1, {title: 'title', body: 'body'})
      expect(res.status).toEqual(httpCreated)
    })

    it('successfully delete comment', async () => {
      const res = await deleteComment({orgName: 'bldrs-ai', name: 'Share'}, 1)
      expect(res.status).toEqual(httpOK)
    })
  })

  describe('get models from github', () => {
    it('successfully get repositories', async () => {
      const res = await getRepositories('bldrs-ai')
      expect(res.data).toEqual([MOCK_REPOSITORY])
    })

    it('successfully get files', async () => {
      const res = await getFiles('pablo-mayrgundter', 'Share')
      expect(res).toEqual(MOCK_FILES)
    })

    it('successfully get files and folders', async () => {
      const {files, directories} = await getFilesAndFolders('Share', 'pablo-mayrgundter', '/', '')
      expect(files.length).toEqual(1)
      expect(directories.length).toEqual(1)
    })
  })

  describe('get latest commit hash', () => {
    it('get latest commit hash', async () => {
      const result = await getLatestCommitHash('testowner', 'testrepo', '', '', '')
      expect(result).toEqual('testsha')
    })
  })

  describe('getOrganizations', () => {
    it('encounters an exception if no access token is provided', () => {
      expect(() => getOrganizations()).rejects
          .toThrowError('Arg 0 is not defined')
    })

    it('receives a list of organizations', async () => {
      const orgs = await getOrganizations('testtoken')
      expect(orgs).toHaveLength(1)

      const org = orgs[0]
      expect(org.login).toEqual('bldrs-ai')
    })
  })

  describe('commitFile', () => {
    it('commits a file and returns the new commit SHA', async () => {
      // Mock file data that should parse properly
      const file = new Blob(['test content'], {type: 'text/plain'})

      // if token passed but isn't valid, should throw 'Bad Credentials'
      expect(await commitFile('owner', 'repo', 'path', file, 'message', 'branch', 'dummyToken'))
          .toBe('newCommitSha')
    })
  })
})


// These used to be in ShareRoutes.test but loading ShareRoutes loaded Share,
// which isn't needed for these utils.
describe('Share GitHub routes', () => {
  // All paths here are .ifc but tests should use these as a template to
  // replace with all supported suffixes.
  const path = '/org/repo/branch/file.ifc'
  const pathAbc = '/org/repo/branch/a/b/c/file.ifc'
  const pathBlob = '/org/repo/blob/branch/file.ifc'
  const pathBlobAbc = '/org/repo/blob/branch/a/b/c/file.ifc'
  const testTemplates = [
    {s: 'http://www.github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: 'http://github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: 'http://www.github.com/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
    {s: 'http://github.com/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
    {s: 'https://www.github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: 'https://github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: 'github.com/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: 'githubcom/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: 'localhost:8080/share/v/gh/org/repo/branch/file.ifc', out: path},
    {s: 'bldrs.ai/share/v/gh/org/repo/branch/file.ifc', out: path},
    {s: 'http://localhost:8080/share/v/gh/org/repo/branch/file.ifc', out: path},
    {s: 'http://bldrs.ai/share/v/gh/org/repo/branch/file.ifc', out: path},
    {s: 'https://localhost:8080/share/v/gh/org/repo/branch/file.ifc', out: path},
    {s: 'https://bldrs.ai/share/v/gh/org/repo/branch/file.ifc', out: path},
    {s: '/org/repo/blob/branch/file.ifc', out: pathBlob},
    {s: '/org/repo/branch/file.ifc', out: path},
    {s: '/org/repo/blob/branch/a/b/c/file.ifc', out: pathBlobAbc},
    {s: '/org/repo/branch/a/b/c/file.ifc', out: pathAbc},
  ]


  /**
   * Replace the tests above by using them a template for paths with
   * different filetypes.
   *
   * @return {Array.<object>}
   */
  function expandTestTemplates() {
    const replaced = []
    for (const test of testTemplates) {
      for (const ext of supportedTypes) {
        const subIn = test.s.replace(/.ifc/, `.${ext}`)
        const subOut = test.out.replace(/.ifc/, `.${ext}`)
        replaced.push({s: subIn, out: subOut})
      }
    }
    // .ifc is one of the supported types, so don't need append original array
    return replaced
  }

  // This is the actual array of tests used for the tests below.
  const tests = expandTestTemplates()


  it('looksLikeLink', () => {
    tests.forEach((pair) => {
      expect(looksLikeLink(pair.s), `With input ${pair.s}`)
        .toBe(pair.out !== undefined || pair.err !== undefined)
    })
  })


  it('trimToPath', () => {
    [
      {s: '', err: 'Expected at least one slash for file path: '},
      {s: 'window', err: 'Expected at least one slash for file path: window'},
    ].concat(tests).forEach((pair) => {
      if (pair.out !== undefined) {
        expect(trimToPath(pair.s), `With input ${pair.s}`).toBe(pair.out)
      } else {
        try {
          trimToPath(pair.s)
        } catch (e) {
          expect(e.message, `With input ${pair.s}`).toBe(pair.err)
          return
        }
        throw new Error(`Fail: expected parse error for input: ${ pair.s}`)
      }
    })
  })


  it('githubUrlOrPathToSharePath', () => {
    const errPrefix = 'Expected a multi-part file path: '
    const errPrefix2 = 'Expected at least one slash for file path: ';
    [
      {s: 'a/b/c', err: `${errPrefix }/b/c`},
      {s: 'www.google.com', err: `${errPrefix2 }www.google.com`},
      {s: 'http://www.google.com', err: `${errPrefix2 }http://www.google.com`},
      {s: 'http://www.google.com/', err: `${errPrefix }/`},
    ].concat(tests).forEach((pair) => {
      if (pair.out !== undefined) {
        const out = pair.out.replace(/blob\//, '')
        expect(githubUrlOrPathToSharePath(pair.s), `With input ${pair.s}`)
          .toBe(`/share/v/gh${ out}`)
      } else {
        try {
          githubUrlOrPathToSharePath(pair.s)
        } catch (e) {
          expect(e.message, `With input ${pair.s}`).toBe(pair.err)
          return
        }
        throw new Error(`Fail: expected parse error for input: ${ pair.s}`)
      }
    })
  })
})
