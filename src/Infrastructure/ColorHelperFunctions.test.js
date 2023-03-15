import {parseColor, interpolateColors, changeValueScale} from './ColorHelperFunctions'
import IfcColor from './IfcColor'


describe('parseColor', () => {
  it('Should parse hex colors into IfcColor object', () => {
    const testSet = ['#FF0023', '#e70a3c', '#efB48a00']
    // eslint-disable-next-line no-magic-numbers
    const expectedResult = [[0.996, 0, 0.137, 1], [0.902, 0.039, 0.234, 1], [0.934, 0.703, 0.539, 0]]
    for (let i = 0; i < testSet.length; i++) {
      const testCase = testSet[i]
      const parsedValue = parseColor(testCase)
      expect([parsedValue.x, parsedValue.y, parsedValue.z, parsedValue.w]).toEqual(expectedResult[i])
    }
  })
})


describe('interpolateColors', () => {
  it('should get a color that lies between another two colors', () => {
    const startColor = new IfcColor(0, 0, 0, 0)
    const endColor = new IfcColor(1, 1, 1, 1)
    // eslint-disable-next-line no-magic-numbers
    const testSet = [0, 0.5, 0.75, 1]
    for (let i = 0; i < testSet.length; i++) {
      const ratio = testSet[i]
      const interpolated = interpolateColors(startColor, endColor, ratio, 0, 1)
      expect([interpolated.x, interpolated.y, interpolated.z, interpolated.w]).toEqual([ratio, ratio, ratio, ratio])
    }
  })
})


describe('changeValueScale', () => {
  it('should convert from one value scale to another', () => {
    const currentMin = 0
    const currentMax = 1
    const targetMin = 50
    const targetMax = 100

    // eslint-disable-next-line no-magic-numbers
    const testSet = [0, 0.5, 0.75, 1]
    // eslint-disable-next-line no-magic-numbers
    const expectedResultSet = [50, 75, 87.5, 100]
    for (let i = 0; i < testSet.length; i++) {
      const testValue = testSet[i]
      const expectedValue = expectedResultSet[i]
      const convertedValue = changeValueScale(testValue, currentMin, currentMax, targetMin, targetMax)
      expect(convertedValue).toEqual(expectedValue)
    }
  })
})
