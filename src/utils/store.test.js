import {act, renderHook} from '@testing-library/react-hooks'
import useStore from './store'


describe('useStore', () => {
  it('Set snack message', () => {
    const {result} = renderHook(() => useStore((state) => state))
    act(() => {
      result.current.setSnackMessage(['loading'])
    })
    expect(result.current.snackMessage).toEqual(['loading'])
  })
})
