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
    // The dialog's other two switches, for the same reason: the live view
    // link (Share/viewLink.js) reads them, so the cut planes (`#cp:`) and the
    // display (`#d:`) stop following while theirs is off. Default on, like
    // the camera: a term is only written once the user has changed it.
    isPlaneInUrl: true,
    setIsPlaneInUrl: (isPlaneInUrl) => set(() => ({isPlaneInUrl})),
    isDisplayInUrl: true,
    setIsDisplayInUrl: (isDisplayInUrl) => set(() => ({isDisplayInUrl})),
  }
}
