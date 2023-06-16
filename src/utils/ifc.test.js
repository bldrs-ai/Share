import {groupElementsByTypes, prettyType} from './ifc'
import {newMockElementHirerachyWithType} from './IfcMock.test'


test('prettyType', () => {
  expect(prettyType('IFCREINFORCINGBAR')).toBe('Reinforcing Bar')
  expect(prettyType('IFCBUILDINGELEMENTPROXY')).toBe('Element (generic proxy)')
  expect(prettyType('IFCWALLSTANDARDCASE')).toBe('Wall (std. case)')
  // Types that ends with 'ELEMENT' should be handled properly
  expect(prettyType('IFCTESTELEMENT')).toBe('Test Element')
  expect(prettyType('IFCDUMMYELEMENT')).toBe('Dummy Element')
})

test('groupElementsByTypes', () => {
  const rootElement = newMockElementHirerachyWithType('IFCTYPE')
  const expected = 'Type'
  const groups = groupElementsByTypes(rootElement)

  expect(groups.length).toBe(1)
  expect(groups[0].name).toBe(expected)
})
