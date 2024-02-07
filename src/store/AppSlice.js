import {checkOPFSAvailability} from '../OPFS/utils'


/**
 * Data stored in Zustand for App state.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createAppSlice(set, get) {
  return {
    appPrefix: null,
    isOpfsAvailable: checkOPFSAvailability(),
    setAppPrefix: (prefix) => set(() => ({appPrefix: prefix})),
  }
}
