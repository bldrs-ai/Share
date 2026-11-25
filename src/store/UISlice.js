import {isVisibleInitially as aboutIsVisibleInitially} from '../Components/About/hashState'
import {isVisibleInitially as helpIsVisibleInitially} from '../Components/Help/hashState'
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

    // A free user's model slots as the server last reported them —
    // `{sub, limit, used, remaining, nextFreeAt, keys}`, or null while
    // unknown (src/export/exportSlots.js#modelSlots). The Export tab reads
    // whether the model on screen is in `keys` (export it freely), and
    // otherwise whether a slot `remaining` is free (its first export takes
    // one) or not (gated). Written from four answers: record-export's GET
    // when the Export tab opens (`useExportSlots`), pro-module's slots
    // header after a delivery, record-export's POST, and pro-module's
    // slots-full refusal (`useExport`). Store rather than component state
    // because the hook that exports and the panel that shows the slots are
    // different components. Carries the `sub` it belongs to, so a sign-out
    // and sign-in as someone else never shows them the previous slots.
    // Design: design/new/glb-export-premium.md §4.8.
    modelSlots: null,
    setModelSlots: (slots) => set(() => ({modelSlots: slots})),

    isHelpVisible: helpIsVisibleInitially(),
    setIsHelpVisible: (is) => set(() => ({isHelpVisible: is})),

    isHelpTooltipsVisible: false,
    setIsHelpTooltipsVisible: (is) => set(() => ({isHelpTooltipsVisible: is})),

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
