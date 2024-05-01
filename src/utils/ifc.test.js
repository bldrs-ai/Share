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
  const rootElement = {
    expressID: 1,
    type: 'IFCPROJECT',
    Name: {
      type: 3,
      value: 'Project root',
    },
    children: [
      newMockElementHirerachyWithType('IFCWALL', 0),
      newMockElementHirerachyWithType('IFCDOOR', 10),
    ],
  }
  const groups = groupElementsByTypes(rootElement)
  expect(groups.length).toBe(3)
  let group = groups[0]
  expect(group.name).toBe('Project')
  expect(group.elements[0].expressID).toBe(1)

  // The expressIDs below are from newMockElementHirerachyWithType, at offset 0 and 10

  group = groups[1]
  expect(group.name).toBe('Wall')
  expect(group.elements[0].expressID).toBe(2)
  expect(group.elements[1].expressID).toBe(6)
  expect(group.elements[2].expressID).toBe(3)
  expect(group.elements[3].expressID).toBe(4)
  expect(group.elements[4].expressID).toBe(7)

  group = groups[2]
  expect(group.name).toBe('Door')
  /* eslint-disable no-magic-numbers */
  expect(group.elements[0].expressID).toBe(12)
  expect(group.elements[1].expressID).toBe(16)
  expect(group.elements[2].expressID).toBe(13)
  expect(group.elements[3].expressID).toBe(14)
  expect(group.elements[4].expressID).toBe(17)
})
