// Replay stand-in for the built pro module. Scenarios that reach the serve
// step point LAMBDA_TASK_ROOT here (`{"$fixturePath": "task-root"}`), so they
// answer the same whether or not `yarn build` has populated the real,
// gitignored `netlify/functions/_pro-modules/`.
export const format = {id: 'glb', ext: 'glb', mime: 'model/gltf-binary', replayStandIn: true}
