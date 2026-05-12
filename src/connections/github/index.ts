/**
 * GitHub provider registration.
 *
 * Side-effect import that registers the GitHub ConnectionProvider and
 * SourceBrowser with the framework registry. Mirrors google-drive/index.ts.
 */

import {registerProvider, registerBrowser} from '../registry'
import {githubProvider} from './GitHubProvider'
import {githubBrowser} from './GitHubBrowser'


registerProvider(githubProvider)
registerBrowser(githubBrowser)

export {githubProvider, githubBrowser}
