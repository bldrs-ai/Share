import {isVisibleInitially as aboutIsVisibleInitially} from '../Components/About/hashState'
import {isVisibleInitially as helpIsVisibleInitially} from '../Components/Help/hashState'
import {isVisibleInitially as imagineIsVisibleInitially} from '../Components/Imagine/hashState'
import {isVisibleInitially as loginIsVisibleInitially} from '../Components/Profile/hashState'
import {isVisibleInitially as shareIsVisibleInitially} from '../Components/Share/hashState'


const isThemeEnabled = process.env.THEME_IS_ENABLED


/**
 * Data stored in Zustand for UI state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createUISlice(set, get) {
  return {
    alert: null,
    setAlert: (a) => set(() => ({alert: a})),

    // TODO(pablo): move all of these to feature slice files
    // NOTE: Nav, Notes, Search and Versions have been moved to their Slices
    isAboutVisible: aboutIsVisibleInitially(),
    setIsAboutVisible: (is) => set(() => ({isAboutVisible: is})),

    // True while an export is running (`src/export/useExport.js`). Shared
    // state rather than the hook's own, because two components call
    // `useExport` in the same tab — `Open/ExportSection.jsx`'s Download GLB
    // and every "Download again" in `Open/ExportsList.jsx` — and per-hook
    // state left each of them enabled while the other one ran: two exports
    // in flight at once, racing each other's read-modify-write of the
    // history mirror. Same shape as `IFCSlice.js`'s isCacheWriteInFlight.
    // See design/new/glb-export-premium.md §4.4.
    isExportInFlight: false,
    setIsExportInFlight: (inFlight) => set(() => ({isExportInFlight: inFlight})),

    // A free user's export allowance as the server last reported it —
    // `{sub, limit, used, remaining, nextFreeAt}`, or null while unknown
    // (src/export/freeExports.js). Written from three answers: record-export's
    // GET when the Export tab opens (`useFreeExports`), pro-module's charge
    // header and record-export's POST after an export, and pro-module's
    // at-the-limit refusal (`useExport`). Store rather than component state
    // because the hook that exports and the panel that shows the count are
    // different components. Carries the `sub` it belongs to, so a sign-out
    // and sign-in as someone else never shows them the previous count.
    // Design: design/new/glb-export-premium.md §4.8.
    freeExportAllowance: null,
    setFreeExportAllowance: (allowance) => set(() => ({freeExportAllowance: allowance})),

    isHelpVisible: helpIsVisibleInitially(),
    setIsHelpVisible: (is) => set(() => ({isHelpVisible: is})),

    isHelpTooltipsVisible: false,
    setIsHelpTooltipsVisible: (is) => set(() => ({isHelpTooltipsVisible: is})),

    isImagineVisible: imagineIsVisibleInitially(),
    setIsImagineVisible: (is) => set(() => ({isImagineVisible: is})),

    isLoginVisible: loginIsVisibleInitially(),
    setIsLoginVisible: (is) => set(() => ({isLoginVisible: is})),

    isSaveModelVisible: false,
    setIsSaveModelVisible: (is) => set(() => ({isSaveModelVisible: is})),

    isShareVisible: shareIsVisibleInitially(),
    setIsShareVisible: (is) => set(() => ({isShareVisible: is})),

    isThemeEnabled: isThemeEnabled,
    setIsThemeEnabled: (is) => set(() => ({isThemeEnabled: is})),

    levelInstance: null,
    setLevelInstance: (planeHeightBottom) => set(() => ({levelInstance: planeHeightBottom})),

    snackMessage: null,
    setSnackMessage: (msg) => set(() => ({snackMessage: msg})),

    viewer: null,
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),

    vh: window.innerHeight,
    setVh: (value) => set({vh: value}),
  }
}
