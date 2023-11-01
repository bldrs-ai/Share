import debug from '../utils/debug'
import {assertDefined} from '../utils/assert'


/**
 * Upload a local file for display.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 * @param {Function} handleBeforeUnload
 */
export function loadLocalFile(navigate, appPrefix, handleBeforeUnload) {
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  assertDefined(navigate, appPrefix, handleBeforeUnload)
  fileInput.setAttribute('type', 'file')
  fileInput.addEventListener(
      'change',
      (event) => {
        debug().log('loader#loadLocalFile#event:', event)
        let tmpUrl = URL.createObjectURL(event.target.files[0])
        debug().log('loader#loadLocalFile#event: url: ', tmpUrl)
        const parts = tmpUrl.split('/')
        tmpUrl = parts[parts.length - 1]
        window.removeEventListener('beforeunload', handleBeforeUnload)
        // TODO(pablo): detect content and set appropriate suffix.
        // Alternatively, leave it without suffix, but this also
        // triggers downstream handling issues.
        navigate(`${appPrefix}/v/new/${tmpUrl}.ifc`)
      },
      false,
  )
  viewerContainer.appendChild(fileInput)
  fileInput.click()
  viewerContainer.removeChild(fileInput)
}


/**
 * Construct browser's actual blob URL from app URL for uploaded file.
 *
 * @param {string} filepath
 * @return {string}
 */
export function getUploadedBlobPath(filepath) {
  const l = window.location
  // TODO(pablo): fix this with the above TODO for ifc suffix.
  filepath = filepath.split('.ifc')[0]
  const parts = filepath.split('/')
  filepath = parts[parts.length - 1]
  filepath = `blob:${l.protocol}//${l.hostname + (l.port ? `:${l.port}` : '')}/${filepath}`
  return filepath
}
