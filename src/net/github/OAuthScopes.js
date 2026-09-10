import {octokit} from './OctokitExport' // TODO(pablo): don't use octokit directly


/**
 * The OAuth scopes GitHub reports for the given token, read from the
 * `X-OAuth-Scopes` response header of a cheap authenticated call. This is
 * ground truth for what the token can do: client-side inference (e.g. "a
 * private repo is visible in the listing") can confirm the `repo` scope
 * but can never deny it, and a recorded grant can go stale when the
 * upstream widening fails or another environment narrows the grant.
 *
 * @param {string} accessToken
 * @return {Promise<Array<string>>} e.g. ['public_repo', 'read:org']
 */
export async function getOAuthScopes(accessToken) {
  const res = await octokit.request('GET /user', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
  const rawScopes = res.headers?.['x-oauth-scopes'] || ''
  return rawScopes.split(',').map((scope) => scope.trim()).filter(Boolean)
}
