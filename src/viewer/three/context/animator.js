import gsap from 'gsap'


export class Animator {
  constructor() {
    this.transformer = gsap
  }
  dispose() {
    this.transformer = null
  }
  move(vector, transform, duration = 1, delay = 0) {
    const x = transform.x
    const y = transform.y
    const z = transform.z
    gsap.to(vector, {duration, delay, x, y, z})
  }
}
// # sourceMappingURL=animator.js.map
