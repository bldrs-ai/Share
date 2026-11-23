import * as path from 'node:path'
import {
  ASSIST_RUNTIME_ENTRY, GFM_ENTRY, aiSdkInputsInMain, assertAiSdkNotInMain, assertGfmNotInMain, gfmInputsInMain,
} from './assistEntry.js'


// The guard build.js runs on every main build's metafile. These metafiles
// use the input and output path shapes esbuild really writes from the repo
// root: cwd-relative, Bun's isolated store under node_modules/.bun/.
const AI = 'node_modules/.bun/ai@7.0.128+68a1e3a0c4588df3/node_modules/ai/dist/index.js'
const PROVIDER = 'node_modules/.bun/@openrouter+ai-sdk-provider@3.1.0+0/node_modules/@openrouter/ai-sdk-provider/dist/index.js'
const PROVIDER_UTILS = 'node_modules/.bun/@ai-sdk+provider-utils@5.0.54/node_modules/@ai-sdk/provider-utils/dist/index.js'
const THREE = 'node_modules/.bun/three@0.184.0/node_modules/three/build/three.module.js'
const RUNTIME = path.relative(process.cwd(), ASSIST_RUNTIME_ENTRY)


/**
 * @param {object} outputs output path → {entryPoint, inputs: [paths]}
 * @return {object} an esbuild-shaped metafile
 */
function metafile(outputs) {
  return {
    outputs: Object.fromEntries(Object.entries(outputs).map(([output, {entryPoint, inputs}]) =>
      [output, {entryPoint, inputs: Object.fromEntries(inputs.map((input) => [input, {bytesInOutput: 1}]))}])),
  }
}


describe('esbuild/assistEntry', () => {
  it('is the Assist runtime module', () => {
    expect(RUNTIME).toBe(path.join('src', 'assist', 'runtime.ts'))
  })

  it('passes a build whose AI SDK is only in the Assist entry', () => {
    const meta = metafile({
      'docs/index.js': {entryPoint: 'src/index.jsx', inputs: ['src/index.jsx', 'src/assist/registry.ts', THREE]},
      'docs/index.css': {entryPoint: 'src/index.jsx', inputs: [AI]},
      'docs/assist/runtime.js': {entryPoint: RUNTIME, inputs: [RUNTIME, 'src/assist/loop.ts', AI, PROVIDER]},
    })
    expect(aiSdkInputsInMain(meta)).toEqual([])
    expect(() => assertAiSdkNotInMain(meta)).not.toThrow()
  })

  it('fails a build where the main bundle took in the SDK or the modules that import it', () => {
    const meta = metafile({
      'docs/index.js': {entryPoint: 'src/index.jsx',
        inputs: ['src/index.jsx', 'src/assist/loop.ts', AI, PROVIDER_UTILS, THREE]},
      'docs/subscribe/index.js': {entryPoint: 'src/subscribe/index.jsx', inputs: [PROVIDER]},
      'docs/assist/runtime.js': {entryPoint: RUNTIME, inputs: [AI]},
    })
    expect(aiSdkInputsInMain(meta)).toEqual([
      {output: 'docs/index.js', input: 'src/assist/loop.ts'},
      {output: 'docs/index.js', input: AI},
      {output: 'docs/index.js', input: PROVIDER_UTILS},
      {output: 'docs/subscribe/index.js', input: PROVIDER},
    ])
    expect(() => assertAiSdkNotInMain(meta)).toThrow(/The AI SDK is in a main bundle \(4 inputs\)/)
  })

  it('matches a hoisted node_modules layout too, and not packages that merely start with "ai"', () => {
    const meta = metafile({
      'docs/index.js': {entryPoint: 'src/index.jsx', inputs: [
        'node_modules/ai/dist/index.js',
        'node_modules/airbnb-js-shims/index.js',
        'node_modules/.bun/axios@1.20.0/node_modules/axios/index.js',
      ]},
    })
    expect(aiSdkInputsInMain(meta).map(({input}) => input)).toEqual(['node_modules/ai/dist/index.js'])
  })
})


describe('esbuild/assistEntry GFM', () => {
  const GFM = 'node_modules/.bun/remark-gfm@3.0.1/node_modules/remark-gfm/index.js'
  const MICROMARK_GFM = 'node_modules/.bun/micromark-extension-gfm-table@1.0.7/node_modules/micromark-extension-gfm-table/index.js'
  const GFM_ENTRY_REL = path.relative(process.cwd(), GFM_ENTRY)

  it('passes a build whose remark-gfm is only in its own entry', () => {
    const meta = metafile({
      'docs/index.js': {entryPoint: 'src/index.jsx', inputs: ['src/index.jsx', 'node_modules/react-markdown/index.js']},
      'docs/Components/Bot/remarkGfmEntry.js': {entryPoint: GFM_ENTRY_REL, inputs: [GFM_ENTRY_REL, GFM, MICROMARK_GFM]},
    })
    expect(gfmInputsInMain(meta)).toEqual([])
    expect(() => assertGfmNotInMain(meta)).not.toThrow()
  })

  it('fails a build where the main bundle took in remark-gfm or its extensions', () => {
    const meta = metafile({
      'docs/index.js': {entryPoint: 'src/index.jsx', inputs: ['src/index.jsx', GFM, MICROMARK_GFM]},
    })
    expect(gfmInputsInMain(meta).map(({input}) => input)).toEqual([GFM, MICROMARK_GFM])
    expect(() => assertGfmNotInMain(meta)).toThrow(/remark-gfm is in a main bundle \(2 inputs\)/)
  })
})
