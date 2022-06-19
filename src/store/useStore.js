import create from 'zustand'
import createUISlice from './UISlice'
import craeateIFCSlice from './IFCSlice'


const useStore = create((set, get) => ({
  ...createUISlice(set, get),
  ...craeateIFCSlice(set, get),
}))

export default useStore


