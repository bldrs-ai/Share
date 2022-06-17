import create from 'zustand'
import createUISlice from './UISlice'
import craeateIFCSlice from './IFCSlice'
import craeateIssuesSlice from './IssuesSlice'


const useStore = create((set, get) => ({
  ...createUISlice(set, get),
  ...craeateIFCSlice(set, get),
  ...craeateIssuesSlice(set, get),
}))

export default useStore


