// gltf-validator ships no types. Only the call `glbNode.ts` makes is
// declared; see the package README for the full options and report shape.
declare module 'gltf-validator' {
  export function validateBytes(data: Uint8Array, options?: {
    format?: 'glb' | 'gltf'
    maxIssues?: number
    ignoredIssues?: string[]
  }): Promise<{
    issues: {
      numErrors: number
      numWarnings: number
      messages: Array<{code: string, message: string, severity: number, pointer?: string}>
    }
  }>
}
