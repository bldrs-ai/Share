/* eslint-disable no-magic-numbers */
import {
  LOAD_FAILURE_REASONS,
  PHASE_NONE,
  SIZE_BUCKET_UNKNOWN,
  bucketFileSize,
  buildOutcomeParams,
  classifyLoadFailure,
  knownFormat,
  loadFailureParams,
  normalizeLoadPhase,
  omitUndefined,
} from './loadAnalytics'
import {EngineOpenFailureError} from './engineOpenFailure'
import {UnsupportedSchemaError} from './unsupportedSchema'


const MB = 1024 * 1024


describe('loader/loadAnalytics', () => {
  describe('bucketFileSize', () => {
    it.each([
      [0, '<1mb'],
      [MB - 1, '<1mb'],
      [MB, '1-10mb'],
      [(10 * MB) - 1, '1-10mb'],
      [10 * MB, '10-50mb'],
      [50 * MB, '50-200mb'],
      [200 * MB, '200mb+'],
      [5000 * MB, '200mb+'],
    ])('%d bytes -> %s', (bytes, bucket) => {
      expect(bucketFileSize(bytes)).toBe(bucket)
    })

    it.each([[undefined], [null], [NaN], [-1], ['12']])('%p is unknown', (bytes) => {
      expect(bucketFileSize(bytes)).toBe(SIZE_BUCKET_UNKNOWN)
    })
  })


  describe('classifyLoadFailure', () => {
    it('OOM wins over the parse pattern', () => {
      expect(classifyLoadFailure(new Error('Aborted(OOM) while parsing'))).toBe(LOAD_FAILURE_REASONS.OOM)
    })

    it('honours the isOutOfMemory tag CadView stamps', () => {
      const error = new Error('something opaque')
      error.isOutOfMemory = true
      expect(classifyLoadFailure(error)).toBe(LOAD_FAILURE_REASONS.OOM)
    })

    it('the typed schema refusal is unsupported_schema', () => {
      expect(classifyLoadFailure(new UnsupportedSchemaError('IFC4X3_RC2'))).toBe(
        LOAD_FAILURE_REASONS.UNSUPPORTED_SCHEMA)
    })

    it('an unrecognised file is unrecognized_format, by status and never by reason text', () => {
      expect(classifyLoadFailure(new EngineOpenFailureError(-1, 'UNRECOGNIZED_FORMAT', 'zip archive'))).toBe(
        LOAD_FAILURE_REASONS.UNRECOGNIZED_FORMAT)
    })

    it('any other engine failure with a reason stays parse', () => {
      expect(classifyLoadFailure(new EngineOpenFailureError(-1, 'OPEN_FAIL', 'bad entity'))).toBe(
        LOAD_FAILURE_REASONS.PARSE)
      expect(classifyLoadFailure(new EngineOpenFailureError(-1, 'INDEX_RESTORE_FAIL', 'no model'))).toBe(
        LOAD_FAILURE_REASONS.PARSE)
    })

    it.each([
      ['OpenModel returned -1'],
      ['Loader error during parse: bad'],
      ['buildBatchedConwayModel: no renderable geometry'],
    ])('%s is parse', (message) => {
      expect(classifyLoadFailure(new Error(message))).toBe(LOAD_FAILURE_REASONS.PARSE)
    })

    it.each([
      ['No response received from server: https://x/y.ifc'],
      ['Error response from server: status(404), message(Not Found)'],
      ['Invalid URL path.  Cannot load resource'],
    ])('%s is other: nothing was parsed', (message) => {
      expect(classifyLoadFailure(new Error(message))).toBe(LOAD_FAILURE_REASONS.OTHER)
    })

    it('tolerates non-Error throwables', () => {
      expect(classifyLoadFailure('boom')).toBe(LOAD_FAILURE_REASONS.OTHER)
      expect(classifyLoadFailure(undefined)).toBe(LOAD_FAILURE_REASONS.OTHER)
    })
  })


  describe('normalizeLoadPhase', () => {
    it('passes engine phases through, lowercased', () => {
      expect(normalizeLoadPhase('geometry')).toBe('geometry')
      expect(normalizeLoadPhase('dataParse')).toBe('dataparse')
    })

    it('slugs the legacy loader strings', () => {
      expect(normalizeLoadPhase('Parsing model data')).toBe('parsing-model-data')
      expect(normalizeLoadPhase('Hashing model...')).toBe('hashing-model')
    })

    it('collapses the per-megabyte download strings into one value', () => {
      expect(normalizeLoadPhase('12 MB')).toBe('download')
      expect(normalizeLoadPhase('0.5 MB')).toBe('download')
    })

    it('never lets an unknown string through', () => {
      expect(normalizeLoadPhase('Loading /home/pablo/secret.ifc')).toBe('other')
    })

    it('reports none when no event was seen', () => {
      expect(normalizeLoadPhase(undefined)).toBe(PHASE_NONE)
      expect(normalizeLoadPhase('')).toBe(PHASE_NONE)
    })
  })


  describe('knownFormat', () => {
    it('keeps supported extensions and hides everything else', () => {
      expect(knownFormat('ifc')).toBe('ifc')
      expect(knownFormat('v2')).toBe('unknown')
      expect(knownFormat(undefined)).toBe('unknown')
    })
  })


  describe('loadFailureParams', () => {
    it('is exactly the closed-set params, no free text', () => {
      const params = loadFailureParams({
        error: new Error('OpenModel returned -1 for /private/path/house.ifc'),
        format: 'ifc',
        fileSize: 30 * MB,
        phase: 'geometry',
      })
      expect(params).toEqual({
        content_type: 'ifc',
        size_bucket: '10-50mb',
        reason_class: 'parse',
        last_phase: 'geometry',
      })
      expect(JSON.stringify(params)).not.toContain('private')
    })

    it('carries the engine\'s status-derived class but none of its reason text', () => {
      const params = loadFailureParams({
        error: new EngineOpenFailureError(-1, 'UNRECOGNIZED_FORMAT', 'unrecognized FILE_SCHEMA SECRET_SCHEMA'),
        format: 'ifc',
        fileSize: MB,
        phase: 'headerparse',
      })
      expect(params.reason_class).toBe('unrecognized_format')
      expect(JSON.stringify(params)).not.toContain('SECRET')
    })

    it('degrades to unknown/none when the load never started reporting', () => {
      expect(loadFailureParams({error: new Error('x')})).toEqual({
        content_type: 'unknown',
        size_bucket: 'unknown',
        reason_class: 'other',
        last_phase: 'none',
      })
    })
  })


  describe('omitUndefined', () => {
    it('drops undefined but keeps zero, false and empty string', () => {
      expect(omitUndefined({a: undefined, b: 0, c: false, d: '', e: null})).toEqual({
        b: 0, c: false, d: '', e: null,
      })
    })
  })
})


describe('loader/loadAnalytics buildOutcomeParams', () => {
  const COMPLETED = {fileSize: 1000, loadTime: 4200, pageErrorCount: 1, pageWarnCount: 2}

  it('prefixes stats and carries load_outcome unprefixed', () => {
    expect(buildOutcomeParams({completedStats: COMPLETED, loadOutcome: 'displayed'})).toEqual({
      load_outcome: 'displayed',
      stats_fileSize: 1000,
      stats_loadTime: 4200,
      stats_pageErrorCount: 1,
      stats_pageWarnCount: 2,
    })
  })

  it('the reporter wall clock wins over any engine loadTime', () => {
    const params = buildOutcomeParams({
      completedStats: COMPLETED,
      loadStats: {loadTime: 300, openMs: 300},
    })
    expect(params.stats_loadTime).toBe(4200)
    expect(params.stats_openMs).toBe(300)
  })

  it('the engine still wins where it is the better source', () => {
    const params = buildOutcomeParams({
      completedStats: {...COMPLETED, memoryUsed: 5},
      loadStats: {memoryUsed: 9},
    })
    expect(params.stats_memoryUsed).toBe(9)
  })

  it('drops undefined values so absent counters stay absent', () => {
    const params = buildOutcomeParams({
      completedStats: {...COMPLETED, memoryUsed: undefined, firstMeshMs: undefined},
      loadStats: {errorCount: undefined},
      loadOutcome: undefined,
    })
    expect(Object.keys(params)).not.toContain('stats_memoryUsed')
    expect(Object.keys(params)).not.toContain('stats_firstMeshMs')
    expect(Object.keys(params)).not.toContain('stats_errorCount')
    expect(Object.keys(params)).not.toContain('load_outcome')
  })

  it('passes conway counts through under the unqualified names once they exist', () => {
    const params = buildOutcomeParams({
      completedStats: COMPLETED,
      loadStats: {errorCount: 7, warningCount: 3},
    })
    expect(params.stats_errorCount).toBe(7)
    expect(params.stats_warningCount).toBe(3)
  })

  it('sends products-with-geometry beside productCount, absent when unknown', () => {
    const known = buildOutcomeParams({
      completedStats: COMPLETED,
      loadStats: {productCount: 9, productsWithGeometryCount: 0},
    })
    // Zero is a real answer (products, none drawn) and must reach GA.
    expect(known.stats_productCount).toBe(9)
    expect(known.stats_productsWithGeometryCount).toBe(0)

    const unknown = buildOutcomeParams({
      completedStats: COMPLETED,
      loadStats: {productCount: 9, productsWithGeometryCount: undefined},
    })
    expect(Object.keys(unknown)).not.toContain('stats_productsWithGeometryCount')
  })

  it('tolerates a load that has neither source', () => {
    expect(buildOutcomeParams({})).toEqual({})
  })
})
