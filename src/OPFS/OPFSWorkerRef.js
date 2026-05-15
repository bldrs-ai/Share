export const workerRef_ = new Worker(new URL('./OPFS.worker.js', import.meta.url), {type: 'module'})
