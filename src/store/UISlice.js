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

    snackMessage: null,
    setSnackMessage: (msg) => set(() => ({snackMessage: msg})),

    viewer: null,
    setViewer: (newViewer) => set(() => ({viewer: newViewer})),

    vh: window.innerHeight,
    setVh: (value) => set({vh: value}),
  }
}
