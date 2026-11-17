/* eslint-disable no-magic-numbers */
import {InPlacePass} from './inPlacePass'


describe('viewer/three/inPlacePass', () => {
  it('renders the inner pass, then copies its output back over the input buffer, without swapping', () => {
    const calls = []
    const inner = {
      name: 'AO',
      needsDepthTexture: true,
      render: (renderer, input, output) => calls.push(['inner', input, output]),
    }
    const pass = new InPlacePass(inner)
    pass.copyPass = {render: (renderer, input, output) => calls.push(['copy', input, output])}
    const input = {name: 'input'}
    const output = {name: 'output'}
    pass.render({}, input, output, 0, false)
    expect(calls).toEqual([['inner', input, output], ['copy', output, input]])
    expect(pass.needsSwap).toBe(false)
    expect(pass.needsDepthTexture).toBe(true)
  })

  it('forwards depth, size and disposal to the inner pass', () => {
    const inner = {setDepthTexture: jest.fn(), setSize: jest.fn(), dispose: jest.fn(), render: jest.fn()}
    const pass = new InPlacePass(inner)
    const depth = {}
    pass.setDepthTexture(depth, 1)
    pass.setSize(10, 20)
    pass.dispose()
    expect(inner.setDepthTexture).toHaveBeenCalledWith(depth, 1)
    expect(inner.setSize).toHaveBeenCalledWith(10, 20)
    expect(inner.dispose).toHaveBeenCalled()
  })
})
