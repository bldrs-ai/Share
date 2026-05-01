// jest-fixed-jsdom doesn't expose MessageChannel on globalThis, so
// install a minimal fake before the module under test imports it.
// Tracks onmessage assignment + close() so the dispose tests can
// assert against them.
if (typeof globalThis.MessageChannel === 'undefined') {
  /** Minimal MessagePort stand-in for the dispose contract tests. */
  class FakeMessagePort {
    onmessage = null
    postMessage = jest.fn()
    close = jest.fn()
  }
  /** Minimal MessageChannel stand-in. */
  globalThis.MessageChannel = class FakeMessageChannel {
    /** @return {void} */
    constructor() {
      this.port1 = new FakeMessagePort()
      this.port2 = new FakeMessagePort()
    }
  }
}


import {IFrameCommunicationChannel} from './AppsMessagesHandler'


/**
 * Build a minimal iframe stub the channel will postMessage into.
 *
 * @return {object}
 */
function makeIframeStub() {
  return {
    src: 'http://localhost/widget',
    contentWindow: {
      postMessage: jest.fn(),
    },
  }
}


describe('IFrameCommunicationChannel', () => {
  describe('construction', () => {
    it('opens a MessageChannel and posts port2 to the iframe with init', () => {
      const iframe = makeIframeStub()
      const channel = new IFrameCommunicationChannel(iframe)
      expect(channel.channel).toBeInstanceOf(MessageChannel)
      expect(channel.port1).toBe(channel.channel.port1)
      expect(iframe.contentWindow.postMessage).toHaveBeenCalledWith(
        'init',
        iframe.src,
        expect.any(Array),
      )
      const [, , transferList] = iframe.contentWindow.postMessage.mock.calls[0]
      expect(transferList).toHaveLength(1)
      // We pass the same port2 that the channel exposes — confirming
      // the iframe receives the active counterpart.
      expect(transferList[0]).toBe(channel.channel.port2)
    })

    it('attaches a messageHandler to port1.onmessage', () => {
      const channel = new IFrameCommunicationChannel(makeIframeStub())
      expect(typeof channel.port1.onmessage).toBe('function')
      expect(channel.port1.onmessage).toBe(channel.messageHandler)
    })
  })


  describe('dispose', () => {
    it('clears port1.onmessage so handler closures can be GC\'d', () => {
      const channel = new IFrameCommunicationChannel(makeIframeStub())
      const port1Ref = channel.port1
      channel.dispose()
      expect(port1Ref.onmessage).toBeNull()
    })

    it('closes port1', () => {
      const channel = new IFrameCommunicationChannel(makeIframeStub())
      const closeSpy = jest.spyOn(channel.port1, 'close')
      channel.dispose()
      expect(closeSpy).toHaveBeenCalledTimes(1)
    })

    it('drops references to channel, port1, and iframe', () => {
      const channel = new IFrameCommunicationChannel(makeIframeStub())
      channel.dispose()
      expect(channel.channel).toBeNull()
      expect(channel.port1).toBeNull()
      expect(channel.iframe).toBeNull()
    })

    it('is idempotent — calling twice does not throw', () => {
      const channel = new IFrameCommunicationChannel(makeIframeStub())
      channel.dispose()
      expect(() => channel.dispose()).not.toThrow()
    })

    it('still releases other resources if port1.close throws', () => {
      const channel = new IFrameCommunicationChannel(makeIframeStub())
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      channel.port1.close = () => {
        throw new Error('close failed')
      }
      expect(() => channel.dispose()).not.toThrow()
      expect(channel.port1).toBeNull()
      expect(channel.channel).toBeNull()
      expect(channel.iframe).toBeNull()
      warnSpy.mockRestore()
    })
  })
})
