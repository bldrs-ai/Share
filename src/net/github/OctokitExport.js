import {Octokit} from '@octokit/rest'
import PkgJson from '../../../package.json'


const GITHUB_BASE_URL_AUTHED = process.env.GITHUB_BASE_URL
// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
export let octokit

initializeOctoKit(!!(process.env.OAUTH2_CLIENT_ID === 'testaudiencejest' ||
    process.env.OAUTH2_CLIENT_ID === 'cypresstestaudience'))


/**
 * Initialize an instance of Octokit depending on auth status.
 */
export function initializeOctoKit(authed) {
    if (authed) {
        octokit = new Octokit({
        baseUrl: GITHUB_BASE_URL_AUTHED,
        userAgent: `bldrs/${PkgJson.version}`,
      })
    } else {
        octokit = new Octokit({
            baseUrl: 'https://api.github.com',
            userAgent: `bldrs/${PkgJson.version}`,
        })
    }
}
