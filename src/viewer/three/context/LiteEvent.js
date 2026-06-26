// -------------------------------------------------------------------------------------------
// Credit to Jason Kleban: https://gist.github.com/JasonKleban/50cee44960c225ac1993c922563aa540
// -------------------------------------------------------------------------------------------
export class LiteEvent {
  constructor() {
    this.handlers = []
    this.trigger = ((data) => {
      // @ts-ignore
      this.handlers.slice(0).forEach((h) => h(data))
    })
  }
  on(handler) {
    this.handlers.push(handler)
  }
  off(handler) {
    this.handlers = this.handlers.filter((h) => h !== handler)
  }
  expose() {
    return this
  }
}
// # sourceMappingURL=LiteEvent.js.map
