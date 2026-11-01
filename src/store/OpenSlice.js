import {isVisibleInitially as openModelIsVisibleInitially} from '../Components/Open/hashState'


/**
 * Open/Save Controls store.
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createOpenSlice(set, get) {
  return {
    isOpenEnabled: true,
    setIsOpenEnabled: (is) => set(() => ({isOpenEnabled: is})),

    isOpenModelVisible: openModelIsVisibleInitially(),
    setIsOpenModelVisible: (is) => set(() => ({isOpenModelVisible: is})),

    // QuotaLimitDialog for a refused drop, rendered by ViewerContainer, which
    // CadView always mounts. In the store, not the dropping component, so the
    // onboarding overlay can raise it: the overlay unmounts as it closes
    // (HelpControl and AboutControl render it only while it has a source),
    // and a dialog in its own state went with it (bldrs-ai/ops#39).
    isDropQuotaDialogVisible: false,
    setIsDropQuotaDialogVisible: (is) => set(() => ({isDropQuotaDialogVisible: is})),

    currentTab: 1,
    setCurrentTab: (currentTab) => set(() => ({currentTab: currentTab})),
  }
}
