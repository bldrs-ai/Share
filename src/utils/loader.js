import {guessTypeFromNameOrFile} from '../Filetype'
import {
  initializeWorker,
  nextRequestId,
  opfsWriteModel,
} from '../OPFS/OPFSService.js'
import {inflateIfGzipEnvelope} from '../loader/gzipEnvelope'
import {assertDefined} from '../utils/assert'
import debug from '../utils/debug'


/**
 * Upload a local file for display.
 *
 * @param {Function} onLoad Called with (storageId, lastModifiedUtc, originalName)
 * @param {boolean} testingSkipAutoRemove
 */
export function loadLocalFileFallback(onLoad, testingSkipAutoRemove = false) {
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  fileInput.setAttribute('type', 'file')
  fileInput.addEventListener(
    'change',
    (event) => {
      debug().log('loader#loadLocalFile#event:', event)
      const file = event.target.files[0]
      const lastModifiedUtc = file.lastModified
      const objectUrl = URL.createObjectURL(file)
      debug().log('loader#loadLocalFile#event: url: ', objectUrl)
      const parts = objectUrl.split('/')
      const tmpUrl = parts[parts.length - 1]
      URL.revokeObjectURL(objectUrl)
      if (onLoad) {
        onLoad(tmpUrl, lastModifiedUtc, file.name)
      }
    },
    false,
  )
  viewerContainer.appendChild(fileInput)
  fileInput.click()
  if (!testingSkipAutoRemove) {
    viewerContainer.removeChild(fileInput)
  }
}


/**
 * Upload a local file for display.
 *
 * The first `onLoad` arg is the OPFS storage id the worker wrote under
 * (`<blob-uuid>.<ext>`) — that's the `/v/new/` path segment. The third
 * is the user's original filename, which callers need to keep as the
 * recents display name (they are NOT interchangeable, see #1682).
 *
 * @param {Function} onLoad Called with (storageId, lastModifiedUtc, originalName)
 * @param {boolean} testingSkipAutoRemove
 * @param {boolean} testingDisableWebWorker
 * @param {Function} [onError] Called with a message for a pick that cannot be
 *   opened at all — a compressed file in a browser with no
 *   `DecompressionStream`, or a name and a header that between them name no
 *   format. Without one this path can only log: the picker has already
 *   closed, so nothing else would tell the user why nothing happened.
 */
export function loadLocalFile(onLoad, testingSkipAutoRemove = false, testingDisableWebWorker = false, onError = null) {
  const viewerContainer = document.getElementById('viewer-container')
  const fileInput = document.createElement('input')
  fileInput.setAttribute('type', 'file')
  let workerRef = null

  // TODO(nickcastel50): set up proper testing for web workers and OPFS
  if (!testingDisableWebWorker) {
    workerRef = initializeWorker()
  }
  fileInput.addEventListener(
    'change',
    async (event) => {
      debug().log('loader#loadLocalFile#event:', event)
      const picked = event.target.files[0]
      const lastModifiedUtc = picked.lastModified
      // A `.glb.gz` — Share's own compressed export (#1854) — is unwrapped
      // before the blob URL is minted, because that URL is all the OPFS
      // worker gets: what it writes is what the loader will later parse.
      // Nothing else in this function then has to know about `.gz`
      // (`loader/gzipEnvelope.js`).
      let file
      try {
        file = await inflateIfGzipEnvelope(picked)
      } catch (e) {
        debug().error('loader#loadLocalFile: cannot open the picked file:', e.message)
        if (onError) {
          onError(e.message)
        }
        return
      }
      const tmpUrl = URL.createObjectURL(file)
      debug().log('loader#loadLocalFile#event: url: ', tmpUrl)
      // Post message to the worker to handle the file
      const parts = tmpUrl.split('/')
      const fileNametmpUrl = parts[parts.length - 1]
      if (!testingDisableWebWorker) {
        // The storage extension is what `findLoader` will resolve this upload
        // by, so it has to survive names the old `split('.').pop()` could not
        // parse: `model.glb.gz` (a glb), `MODEL.GLB.GZ`, and a file called
        // just `.gz`, which only its header can answer for.
        const ext = await guessTypeFromNameOrFile(file)
        if (ext === null) {
          URL.revokeObjectURL(tmpUrl)
          const message = `Cannot extract filetype from filename: ${picked.name}`
          debug().error('loader#loadLocalFile:', message)
          if (onError) {
            onError(message)
          }
          return
        }
        // Minted before the listener attaches so it can close over the id.
        const requestId = nextRequestId()
        // Listener for messages from the worker.  We can't revoke
        // tmpUrl until the worker is done with it, so revoke when the
        // listener detaches (success or error path).
        const listener = (workerEvent) => {
          // Only this request's replies. Without the filter this accepts ANY
          // error from the shared worker, so once the OPFS/utils.js helpers
          // became correlated (#1785) an unrelated request's failure would
          // detach this listener and revoke `tmpUrl` while its own write was
          // still in flight — the upload then silently never calls onLoad.
          if (workerEvent.data.requestId !== requestId) {
            return
          }
          if (workerEvent.data.error || workerEvent.data.requestFinished) {
            const message = workerEvent.data.error ??
              `OPFS worker finished ${requestId} without a reply`
            debug().error('Error from worker:', message)
            workerRef.removeEventListener('message', listener)
            URL.revokeObjectURL(tmpUrl)
          } else if (workerEvent.data.completed) {
            if (workerEvent.data.event === 'write') {
              debug().log('Worker finished writing file')
              workerRef.removeEventListener('message', listener)
              URL.revokeObjectURL(tmpUrl)
              onLoad(workerEvent.data.fileName, lastModifiedUtc, picked.name)
            } else if (workerEvent.data.event === 'read') {
              debug().log('Worker finished reading file')
              workerRef.removeEventListener('message', listener)
              URL.revokeObjectURL(tmpUrl)
              onLoad(workerEvent.data.file.name, lastModifiedUtc, picked.name)
            }
          }
        }
        workerRef.addEventListener('message', listener)
        // The user's own filename, envelope and all: it is the display name
        // for recents and the load report, not something to resolve against.
        opfsWriteModel(tmpUrl, picked.name, `${fileNametmpUrl}.${ext}`, requestId)
      } else {
        URL.revokeObjectURL(tmpUrl)
        onLoad(fileNametmpUrl, lastModifiedUtc, picked.name)
      }
    },
    false,
  )

  viewerContainer.appendChild(fileInput)
  fileInput.click()
  if (!testingSkipAutoRemove) {
    viewerContainer.removeChild(fileInput)
  }
}


/**
 * Upload a local file for display from Drag And Drop.
 *
 * @param {File} file
 * @param {Function} callback Not optional since all known flows require it.
 */
export function saveDnDFileToOpfsFallback(file, callback) {
  assertDefined(file, callback)
  const objectUrl = URL.createObjectURL(file)
  debug().log('utils/loader#saveDnDFileToOpfsAndNavFallback: url: ', objectUrl)
  const parts = objectUrl.split('/')
  const tmpUrl = parts[parts.length - 1]
  URL.revokeObjectURL(objectUrl)
  callback(tmpUrl)
}
