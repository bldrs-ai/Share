import {parseGitHubRepositoryURL} from './GitHub'


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
      expect(actual.path).toEqual('/haus.ifc')
    })
  })
})
