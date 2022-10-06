import {MOCK_ISSUES} from '../../src/utils/GitHub'


const rest = jest.createMockFromModule('@octokit/rest')

let __mockIssues = MOCK_ISSUES

/**
 * Setting mock issues e.g. setting it to null or empty issues
 */
function __setMockIssues(issues) {
  __mockIssues = issues
}


const Octokit = {
  request: jest.fn(
      (path) => {
        if (path === 'GET /repos/{org}/{repo}/issues') {
          return {__mockIssues}
        } else {
          throw new Error('invalid test case')
        }
      },
  ),
}
const constructorMock = rest.Octokit
constructorMock.mockImplementation(() => Octokit)


/**
 * Mock of Octokit for unit testing.
 *
 * @return {object} Octokit
 */
function __getMockOctokit() {
  return Octokit
}

export {constructorMock as Octokit, __getMockOctokit, __setMockIssues}
