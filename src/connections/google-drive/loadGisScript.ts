/**
 * Dynamically loads the Google Identity Services (GIS) client script.
 * The script is loaded on demand when a user first connects Google Drive,
 * rather than on every page load.
 */

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const PICKER_SCRIPT_URL = 'https://apis.google.com/js/api.js'

let gisLoadPromise: Promise<void> | null = null
let pickerLoadPromise: Promise<void> | null = null


/** Load the Google Identity Services script (for OAuth token acquisition). */
export function loadGisScript(): Promise<void> {
  if (gisLoadPromise) {
    return gisLoadPromise
  }

  // Already loaded (e.g. via index.html)
  if (typeof google !== 'undefined' && google.accounts?.oauth2) {
    gisLoadPromise = Promise.resolve()
    return gisLoadPromise
  }

  gisLoadPromise = loadScript(GIS_SCRIPT_URL)
  return gisLoadPromise
}


/** Load the Google Picker API script. */
export function loadPickerScript(): Promise<void> {
  if (pickerLoadPromise) {
    return pickerLoadPromise
  }

  // Already loaded
  if (typeof gapi !== 'undefined' && gapi.loaded) {
    pickerLoadPromise = Promise.resolve()
    return pickerLoadPromise
  }

  pickerLoadPromise = loadScript(PICKER_SCRIPT_URL).then(() => {
    return new Promise<void>((resolve) => {
      gapi.load('picker', {callback: resolve})
    })
  })
  return pickerLoadPromise
}


/**
 * @param src Script URL to load
 * @return Promise that resolves when the script is loaded
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if script tag already exists
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      // If already loaded, resolve immediately
      if ((existing as HTMLScriptElement).dataset.loaded === 'true') {
        resolve()
      }
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(script)
  })
}


// Type declarations for GIS and gapi globals
declare global {
  const google: {
    accounts: {
      oauth2: {
        initTokenClient(config: TokenClientConfig): TokenClient
        revoke(token: string, callback: () => void): void
      }
    }
    picker: {
      PickerBuilder: new () => PickerBuilder
      ViewId: {
        DOCS: string
        FOLDERS: string
      }
      DocsView: new (viewId?: string) => DocsView
      DocsViewMode: {
        LIST: string
        GRID: string
      }
      Feature: {
        NAV_HIDDEN: string
        MULTISELECT_ENABLED: string
        SUPPORT_DRIVES: string
      }
      Action: {
        PICKED: string
        CANCEL: string
      }
      Response: {
        ACTION: string
        DOCUMENTS: string
      }
      Document: {
        ID: string
        NAME: string
        URL: string
        MIME_TYPE: string
        TYPE: string
        PARENT_ID: string
      }
    }
  }

  const gapi: {
    loaded: number
    load(api: string, config: {callback: () => void}): void
  }
}

export interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: {type: string; message: string}) => void
  hint?: string
  prompt?: string
}

export interface TokenClient {
  requestAccessToken(config?: {prompt?: string; hint?: string}): void
}

export interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

export interface PickerBuilder {
  addView(view: unknown): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(appId: string): PickerBuilder
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder
  enableFeature(feature: string): PickerBuilder
  disableFeature(feature: string): PickerBuilder
  setTitle(title: string): PickerBuilder
  setLocale(locale: string): PickerBuilder
  setSize(width: number, height: number): PickerBuilder
  build(): Picker
}

export interface DocsView {
  setMimeTypes(mimeTypes: string): DocsView
  setIncludeFolders(include: boolean): DocsView
  setSelectFolderEnabled(enabled: boolean): DocsView
  setParent(folderId: string): DocsView
  setStarred(starred: boolean): DocsView
  setMode(mode: string): DocsView
  setOwnedByMe(ownedByMe: boolean): DocsView
}

export interface Picker {
  setVisible(visible: boolean): void
  dispose(): void
}

export interface PickerCallbackData {
  [key: string]: unknown
}

export interface PickerDocument {
  [key: string]: unknown
}
