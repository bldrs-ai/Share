/**
 * Fake Google APIs for Playwright tests.
 *
 * Loaded via page.addInitScript({path}) before any page scripts run.
 * Prevents real OAuth popups and external Picker UI during tests.
 *
 * - window.google.accounts.oauth2: calls callback immediately with a dummy token
 * - window.google.picker.PickerBuilder: stores last built picker at window.__lastPicker
 * - window.gapi: marks picker library as already loaded
 */

/* eslint-disable no-magic-numbers */

const FAKE_EXPIRES_IN = 3600

window.google = {
  accounts: {
    oauth2: {
      /**
       * @param {object} config Token client configuration
       * @return {object} Token client
       */
      initTokenClient(config) {
        return {
          /**
           * @param {object} [tokenConfig] Optional config including state for CSRF verification
           * @return {void}
           */
          requestAccessToken(tokenConfig) {
            setTimeout(() => {
              config.callback({
                access_token: 'fake-gis-access-token',
                expires_in: FAKE_EXPIRES_IN,
                scope: 'https://www.googleapis.com/auth/drive.readonly',
                token_type: 'Bearer',
                state: tokenConfig?.state,
              })
            }, 50)
          },
        }
      },
      /**
       * @param {string} _token Access token to revoke
       * @param {Function} callback Completion callback
       * @return {void}
       */
      revoke(_token, callback) {
        callback()
      },
    },
  },
  picker: {
    /**
     * Fake Google Picker builder.
     * Stores the last built picker at window.__lastPicker for test assertions.
     */
    PickerBuilder: class {
      /**
       * @param {object} _view View to add
       * @return {this}
       */
      addView(_view) {
        return this
      }

      /**
       * @param {string} _token OAuth access token
       * @return {this}
       */
      setOAuthToken(_token) {
        return this
      }

      /**
       * @param {string} _key Developer API key
       * @return {this}
       */
      setDeveloperKey(_key) {
        return this
      }

      /**
       * @param {string} _appId Google Cloud project app ID
       * @return {this}
       */
      setAppId(_appId) {
        return this
      }

      /**
       * @param {Function} cb Callback invoked when user picks or cancels
       * @return {this}
       */
      setCallback(cb) {
        this._callback = cb
        return this
      }

      /**
       * @param {string} _feature Feature flag to enable
       * @return {this}
       */
      enableFeature(_feature) {
        return this
      }

      /**
       * @param {string} _title Dialog title
       * @return {this}
       */
      setTitle(_title) {
        return this
      }

      /**
       * @param {number} _w Width in pixels
       * @param {number} _h Height in pixels
       * @return {this}
       */
      setSize(_w, _h) {
        return this
      }

      /**
       * @return {object} Picker instance
       */
      build() {
        const picker = {
          _callback: this._callback,
          /**
           * @param {boolean} _v Whether to show the picker
           * @return {void}
           */
          setVisible(_v) {
            return undefined
          },
          /**
           * @return {undefined}
           */
          dispose() {
            return undefined
          },
        }
        window.__lastPicker = picker
        return picker
      }
    },

    /**
     * Fake DocsView — all configuration methods are no-ops.
     */
    DocsView: class {
      /**
       * @param {string} _types Comma-separated MIME types
       * @return {this}
       */
      setMimeTypes(_types) {
        return this
      }

      /**
       * @param {boolean} _include Whether to include folders in results
       * @return {this}
       */
      setIncludeFolders(_include) {
        return this
      }

      /**
       * @param {boolean} _enabled Whether folders are selectable
       * @return {this}
       */
      setSelectFolderEnabled(_enabled) {
        return this
      }

      /**
       * @param {string} _mode Display mode (list/grid)
       * @return {this}
       */
      setMode(_mode) {
        return this
      }
    },

    ViewId: {DOCS: 'DOCS', FOLDERS: 'FOLDERS'},
    DocsViewMode: {LIST: 'LIST', GRID: 'GRID'},
    Feature: {
      NAV_HIDDEN: 'NAV_HIDDEN',
      MULTISELECT_ENABLED: 'MULTISELECT_ENABLED',
      SUPPORT_DRIVES: 'SUPPORT_DRIVES',
    },
    Action: {PICKED: 'PICKED', CANCEL: 'CANCEL'},
    Response: {ACTION: 'action', DOCUMENTS: 'docs'},
    Document: {
      ID: 'id',
      NAME: 'name',
      URL: 'url',
      MIME_TYPE: 'mimeType',
      TYPE: 'type',
      PARENT_ID: 'parentId',
    },
  },
}

// Mark the picker library as already loaded to skip the external script fetch
window.gapi = {
  loaded: 1,
  /**
   * @param {string} _api API name to load
   * @param {object} config Load configuration with callback
   * @return {void}
   */
  load(_api, config) {
    config.callback()
  },
}
