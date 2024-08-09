import {Octokit} from '@octokit/rest'
import PkgJson from '../../../package.json'


const GITHUB_BASE_URL_AUTHED = process.env.GITHUB_BASE_URL
const GITHUB_BASE_URL_UNAUTHED = process.env.GITHUB_BASE_URL_UNAUTHENTICATED
// All direct uses of octokit should be private to this file to
// ensure we setup mocks for local use and unit testing.
export let octokit

initializeOctoKitUnauthenticated()


/**
 * Initialize an instance of Octokit authenticated.
 */
export function initializeOctoKitAuthenticated() {
    octokit = new Octokit({
    baseUrl: GITHUB_BASE_URL_AUTHED,
    userAgent: `bldrs/${PkgJson.version}`,
    })
}

/**
 * Initialize an instance of Octokit unauthenticated.
 */
export function initializeOctoKitUnauthenticated() {
    octokit = new Octokit({
    baseUrl: GITHUB_BASE_URL_UNAUTHED,
    userAgent: `bldrs/${PkgJson.version}`,
    })
}
