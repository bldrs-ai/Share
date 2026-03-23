import {useCallback, useEffect, useRef} from 'react'
import {loadPickerScript} from '../../connections/google-drive/loadGisScript'


/* global google */

// MUI Dialog sits at z-index 1300; Google Picker must render above it.
// The Picker injects .picker-dialog-bg and .picker-dialog into <body> with its
// own z-index values, so we override them here.
const PICKER_Z_INDEX_STYLE_ID = 'google-picker-z-index'
const PICKER_Z_INDEX = 1400
const PICKER_WIDTH = 900
const PICKER_HEIGHT = 600


/**
 * Opens a native Google Drive Picker for file or folder selection.
 *
 * Uses the raw Google Picker API (loaded dynamically) rather than
 * a wrapper package, for maximum compatibility with esbuild.
 *
 * @property {string} accessToken Google OAuth access token
 * @property {boolean} isOpen Whether to show the picker
 * @property {string} mode 'file' (default) or 'folder'
 * @property {Function} onSelect Called with array of selected documents
 * @property {Function} onCancel Called when picker is dismissed without selection
 * @return {null} This component renders nothing; it triggers the Picker overlay.
 */
export default function GoogleDrivePickerDialog({
  accessToken,
  isOpen,
  mode = 'file',
  onSelect,
  onCancel,
}) {
  const pickerRef = useRef(null)

  // Inject CSS to lift Google Picker's overlay above the MUI Dialog.
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    const existing = document.getElementById(PICKER_Z_INDEX_STYLE_ID)
    if (existing) {
      return undefined
    }
    const style = document.createElement('style')
    style.id = PICKER_Z_INDEX_STYLE_ID
    style.textContent = [
      `.picker-dialog-bg { z-index: ${PICKER_Z_INDEX} !important; }`,
      `.picker-dialog { z-index: ${PICKER_Z_INDEX + 1} !important; }`,
    ].join('\n')
    document.head.appendChild(style)
    return () => style.remove()
  }, [isOpen])

  const handlePickerCallback = useCallback((data) => {
    const action = data[google.picker.Response.ACTION]

    if (action === google.picker.Action.PICKED) {
      const docs = data[google.picker.Response.DOCUMENTS]
      if (docs && docs.length > 0) {
        onSelect(docs.map((doc) => ({
          id: doc[google.picker.Document.ID],
          name: doc[google.picker.Document.NAME],
          url: doc[google.picker.Document.URL],
          mimeType: doc[google.picker.Document.MIME_TYPE],
          parentId: doc[google.picker.Document.PARENT_ID],
          lastModifiedUtc: doc[google.picker.Document.LAST_EDITED_UTC] || null,
        })))
      }
    } else if (action === google.picker.Action.CANCEL) {
      onCancel()
    }
  }, [onSelect, onCancel])

  useEffect(() => {
    if (!isOpen || !accessToken) {
      return
    }

    let disposed = false

    const buildPicker = async () => {
      await loadPickerScript()

      if (disposed) {
        return
      }

      const apiKey = process.env.GOOGLE_API_KEY
      const appId = process.env.GOOGLE_APP_ID || ''

      let view
      if (mode === 'folder') {
        view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        view.setSelectFolderEnabled(true)
        view.setIncludeFolders(true)
      } else {
        // File mode: show all files, allow navigating into folders
        view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        view.setIncludeFolders(true)
        view.setMode(google.picker.DocsViewMode.LIST)
      }

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setCallback(handlePickerCallback)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setTitle(mode === 'folder' ? 'Select a folder' : 'Select a file')
        .setSize(PICKER_WIDTH, PICKER_HEIGHT)

      if (apiKey) {
        builder.setDeveloperKey(apiKey)
      }

      if (appId) {
        builder.setAppId(appId)
      }

      const picker = builder.build()
      pickerRef.current = picker
      picker.setVisible(true)
    }

    buildPicker()

    return () => {
      disposed = true
      if (pickerRef.current) {
        pickerRef.current.dispose()
        pickerRef.current = null
      }
    }
  }, [isOpen, accessToken, mode, handlePickerCallback])

  // This component only triggers the Google Picker overlay; it renders nothing
  return null
}
