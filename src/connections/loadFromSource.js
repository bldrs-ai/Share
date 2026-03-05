import {
  initializeWorker,
  opfsWriteModel,
} from '../OPFS/OPFSService.js'
import {checkOPFSAvailability} from '../OPFS/utils'
import {getProvider, getBrowser} from './registry'
import debug from '../utils/debug'


/**
 * Load a file from a Source into the viewer.
 *
 * Downloads the file using the provider's OAuth token, writes it to OPFS
 * (or creates a blob URL as fallback), and calls onLoad with the filename
 * for navigation to /v/new/<filename>.
 *
 * @param {object} connection The Connection object
 * @param {object} source The Source object
 * @param {object} file The SourceFile to load (from listFiles)
 * @param {Function} onLoad Callback with filename once ready for navigation
 * @return {Promise<void>}
 */
export async function loadFileFromSource(connection, source, file, onLoad) {
  const provider = getProvider(connection.providerId)
  const browser = getBrowser(connection.providerId)

  if (!provider || !browser) {
    throw new Error(`No provider registered for ${connection.providerId}`)
  }

  debug().log('loadFromSource: downloading', file.name, 'from', connection.providerId)

  // Download the file content
  const download = await browser.getFileDownload(connection, source, file.id)

  let blob = download.blob
  if (!blob && download.downloadUrl) {
    // Need to fetch with auth header
    const token = await provider.getAccessToken(connection)
    const response = await fetch(download.downloadUrl.toString(), {
      headers: {Authorization: `Bearer ${token}`},
    })
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`)
    }
    blob = await response.blob()
  }

  if (!blob) {
    throw new Error('No file content received')
  }

  const filename = download.filename || file.name

  // Try to write to OPFS (matches the local file upload pattern)
  if (checkOPFSAvailability()) {
    const blobUrl = URL.createObjectURL(blob)
    const dotParts = filename.split('.')
    if (dotParts.length <= 1) {
      throw new Error('Cannot extract filetype from filename')
    }
    const ext = dotParts[dotParts.length - 1]
    const workerRef = initializeWorker()

    if (workerRef) {
      return new Promise((resolve, reject) => {
        const listener = (event) => {
          if (event.data.error) {
            debug().error('loadFromSource: OPFS write error:', event.data.error)
            workerRef.removeEventListener('message', listener)
            reject(new Error(event.data.error))
          } else if (event.data.completed && event.data.event === 'write') {
            debug().log('loadFromSource: OPFS write complete')
            workerRef.removeEventListener('message', listener)
            onLoad(event.data.fileName)
            resolve()
          }
        }
        workerRef.addEventListener('message', listener)
        // Write blob URL to OPFS; the worker will fetch the blob and store it
        const parts = blobUrl.split('/')
        const blobName = parts[parts.length - 1]
        opfsWriteModel(blobUrl, filename, `${blobName}.${ext}`)
      })
    }
  }

  // Fallback: use blob URL directly (no OPFS)
  let tmpUrl = URL.createObjectURL(blob)
  const parts = tmpUrl.split('/')
  tmpUrl = parts[parts.length - 1]
  onLoad(tmpUrl)
}
