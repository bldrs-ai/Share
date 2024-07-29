import {Octokit} from '@octokit/rest'
import PkgJson from '../../../package.json'


const GITHUB_BASE_URL_AUTHED = process.env.GITHUB_BASE_URL
const GITHUB_BASE_URL_UNAUTHED = process.env.GITHUB_BASE_URL_UNAUTHENTICATED
// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
export let octokit

initializeOctoKit(false)


/**
 * Initialize an instance of Octokit depending on auth status.
 */
export function initializeOctoKit(authed) {
    octokit = new Octokit({
    baseUrl: authed ? GITHUB_BASE_URL_AUTHED : GITHUB_BASE_URL_UNAUTHED,
    userAgent: `bldrs/${PkgJson.version}`,
    })
}
