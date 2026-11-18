/**
 * Data stored in Zustand for any root Share App state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createShareSlice(set, get) {
  return {
    appPrefix: null,
    setAppPrefix: (prefix) => set(() => ({appPrefix: prefix})),
    // The Share dialog's "Camera position" switch, default on. In the store
    // rather than the dialog's own state because the live camera link
    // (Components/Camera/liveCameraLink.js) reads it too: off, the link
    // stops following the camera until the user turns it back on. Session
    // state, so it also outlives the dialog being closed and reopened.
    isCameraInUrl: true,
    setIsCameraInUrl: (isCameraInUrl) => set(() => ({isCameraInUrl})),
  }
}
