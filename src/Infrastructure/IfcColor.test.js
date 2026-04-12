/* eslint-disable no-magic-numbers */
import IfcColor from './IfcColor'


describe('Infrastructure/IfcColor', () => {
  it('assigns rgba channels to x/y/z/w', () => {
    const c = new IfcColor(0.1, 0.2, 0.3, 0.4)
    expect(c.x).toBe(0.1)
    expect(c.y).toBe(0.2)
    expect(c.z).toBe(0.3)
    expect(c.w).toBe(0.4)
  })

  it('defaults to black with full opacity', () => {
    const c = new IfcColor()
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    expect(c.z).toBe(0)
    expect(c.w).toBe(1)
  })

  it('allows partial defaults (only specifying rgb)', () => {
    const c = new IfcColor(1, 0.5, 0)
    expect(c.x).toBe(1)
    expect(c.y).toBe(0.5)
    expect(c.z).toBe(0)
    expect(c.w).toBe(1) // default opacity
  })
})
