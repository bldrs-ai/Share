/**
 * Google Drive provider registration.
 *
 * Import this module to register the Google Drive ConnectionProvider
 * and SourceBrowser with the framework registry.
 */

import {registerProvider, registerBrowser} from '../registry'
import {googleDriveProvider} from './GoogleDriveProvider'
import {googleDriveBrowser} from './GoogleDriveBrowser'


registerProvider(googleDriveProvider)
registerBrowser(googleDriveBrowser)

export {googleDriveProvider, googleDriveBrowser}
