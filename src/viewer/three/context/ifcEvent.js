export var IfcEvent;
(function(IfcEvent) {
  IfcEvent['onCameraReady'] = 'onCameraReady'
})(IfcEvent || (IfcEvent = {}))
export class IfcEvents {
  constructor() {
    this.events = {
      [IfcEvent.onCameraReady]: {
        needsUpdate: false,
        published: false,
        actions: [],
      },
    }
  }
  dispose() {
    this.events.onCameraReady.actions.length = 0
    this.events = null
  }
  subscribe(event, action) {
    this.events[event].actions.push(action)
    this.events[event].needsUpdate = true
    this.update(event)
  }
  publish(event) {
    this.events[event].published = true
    this.update(event)
  }
  update(event) {
    if (this.events[event].needsUpdate && this.events[event].published) {
      const actions = this.events[event].actions
      for (let i = 0; i < actions.length; i++) {
        actions[i]()
      }
      actions.length = 0
    }
  }
}
// # sourceMappingURL=ifcEvent.js.map
