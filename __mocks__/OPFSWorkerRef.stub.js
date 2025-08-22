// A small in-place fake worker that becomes "ready" after initializeWorker message
const messageListeners = new Set();

export const workerRef_ = {
  script: '/OPFS.Worker.js',
  postMessage: jest.fn((msg) => {
    // When OPFSService sends the init command, ACK asynchronously
    if (msg && msg.command === 'initializeWorker') {
      // Use a microtask so no fake-timer juggling is needed
      Promise.resolve().then(() => {
        const evt = { type: 'message', data: { event: 'workerInitialized', completed: true } };
        // Support both patterns: addEventListener and onmessage
        workerRef_.onmessage?.(evt);
        for (const fn of messageListeners) fn(evt);
      });
    }
  }),
  terminate: jest.fn(),

  addEventListener: jest.fn((type, fn) => {
    if (type === 'message') messageListeners.add(fn);
  }),
  removeEventListener: jest.fn((type, fn) => {
    if (type === 'message') messageListeners.delete(fn);
  }),

  // Some code uses direct assignment
  onmessage: null,
};