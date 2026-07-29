/* eslint-disable no-magic-numbers */
import {
  resolveAppearance,
  scopeKey,
  scopeMatchesTarget,
} from './overrideStack'


describe('scopeKey', () => {
  it('keys model without a ref and others by kind:ref', () => {
    expect(scopeKey({kind: 'model'})).toBe('model')
    expect(scopeKey({kind: 'element', ref: 42})).toBe('element:42')
    expect(scopeKey({kind: 'subtree', ref: '3.7'})).toBe('subtree:3.7')
  })
})


describe('scopeMatchesTarget', () => {
  it('model matches every target', () => {
    expect(scopeMatchesTarget({kind: 'model'}, {})).toBe(true)
    expect(scopeMatchesTarget({kind: 'model'}, {expressID: 9})).toBe(true)
  })

  it('element matches by expressID, number/string agnostic', () => {
    expect(scopeMatchesTarget({kind: 'element', ref: 42}, {expressID: 42})).toBe(true)
    expect(scopeMatchesTarget({kind: 'element', ref: '42'}, {expressID: 42})).toBe(true)
    expect(scopeMatchesTarget({kind: 'element', ref: 42}, {expressID: 7})).toBe(false)
    expect(scopeMatchesTarget({kind: 'element', ref: 42}, {})).toBe(false)
  })

  it('subtree matches a path at or below it, guarding partial segments', () => {
    const scope = {kind: 'subtree', ref: '3.7'}
    expect(scopeMatchesTarget(scope, {occurrencePathKey: '3.7'})).toBe(true)
    expect(scopeMatchesTarget(scope, {occurrencePathKey: '3.7.2'})).toBe(true)
    // '3.70' is NOT under '3.7' — segment boundary must be respected.
    expect(scopeMatchesTarget(scope, {occurrencePathKey: '3.70'})).toBe(false)
    expect(scopeMatchesTarget(scope, {occurrencePathKey: '4.7'})).toBe(false)
  })

  it('occurrence matches the exact path only', () => {
    const scope = {kind: 'occurrence', ref: '3.7'}
    expect(scopeMatchesTarget(scope, {occurrencePathKey: '3.7'})).toBe(true)
    expect(scopeMatchesTarget(scope, {occurrencePathKey: '3.7.2'})).toBe(false)
  })
})


describe('resolveAppearance', () => {
  const ov = (kind, ref, appearance) => ({scope: {kind, ref}, appearance})

  it('is empty when nothing matches', () => {
    expect(resolveAppearance([ov('element', 1, {color: 'source'})], {expressID: 2})).toEqual({})
  })

  it('resolves each axis independently from the most specific setter', () => {
    const overrides = [
      ov('model', undefined, {color: 'auto', shading: 'shaded'}),
      ov('subtree', '3', {shading: 'wireframe'}),
    ]
    // Whole-model target sees only the model override.
    expect(resolveAppearance(overrides, {})).toEqual({color: 'auto', shading: 'shaded'})
    // A target under sub-tree 3 keeps the model color but takes the sub-tree
    // shading — axes don't clobber each other.
    expect(resolveAppearance(overrides, {occurrencePathKey: '3.1'}))
      .toEqual({color: 'auto', shading: 'wireframe'})
  })

  it('lets a deeper sub-tree win over a shallower one', () => {
    const overrides = [
      ov('subtree', '3', {shading: 'wireframe'}),
      ov('subtree', '3.7', {shading: 'shadedEdges'}),
    ]
    expect(resolveAppearance(overrides, {occurrencePathKey: '3.7.2'}))
      .toEqual({shading: 'shadedEdges'})
    // A sibling under 3 but not 3.7 still gets the shallower value.
    expect(resolveAppearance(overrides, {occurrencePathKey: '3.1'}))
      .toEqual({shading: 'wireframe'})
  })

  it('lets an element override beat model and sub-tree', () => {
    const overrides = [
      ov('model', undefined, {color: 'auto'}),
      ov('subtree', '3', {color: 'source'}),
      ov('element', 99, {color: 'auto'}),
    ]
    // Element 99 sits under sub-tree 3; its own color wins.
    expect(resolveAppearance(overrides, {expressID: 99, occurrencePathKey: '3.4'}))
      .toEqual({color: 'auto'})
  })
})
