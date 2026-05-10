/**
 * GitHub provider registration.
 *
 * Side-effect import that registers the GitHub ConnectionProvider with the
 * framework registry. No SourceBrowser yet — that lands in identity-
 * decoupling PR2 alongside the SourcesTab integration.
 */

import {registerProvider} from '../registry'
import {githubProvider} from './GitHubProvider'


registerProvider(githubProvider)

export {githubProvider}
