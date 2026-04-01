
/**
 * Zustand slice for Connections state.
 *
 * A Connection is an authenticated binding to an external service
 * (e.g. Google account, GitHub account).
 *
 * @param {Function} set
 * @param {Function} get
 * @return {object} Zustand slice.
 */
export default function createConnectionsSlice(set, get) {
  return {
    connections: [],

    addConnection: (connection) =>
      set((state) => ({connections: [...state.connections, connection]})),

    updateConnection: (id, updates) =>
      set((state) => ({
        connections: state.connections.map((c) =>
          c.id === id ? {...c, ...updates} : c,
        ),
      })),

    removeConnection: (id) =>
      set((state) => ({
        connections: state.connections.filter((c) => c.id !== id),
        // Cascade: remove all Sources under this Connection
        sources: state.sources.filter((s) => s.connectionId !== id),
      })),

    activeConnectionId: null,
    setActiveConnectionId: (id) => set(() => ({activeConnectionId: id})),
  }
}
