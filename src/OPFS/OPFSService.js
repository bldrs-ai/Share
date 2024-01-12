import debug from '../utils/debug'
// OPFSService.js
let workerRef = null;

export const initializeWorker = () => {
    if (workerRef === null) {
        workerRef = workerRef = new Worker('/OPFS.Worker.js');
    }

    debug()

    return workerRef
};

export const terminateWorker = () => {
    if (workerRef) {
        workerRef.terminate();
        workerRef = null;
    }
};

export const opfsWriteFile = async (objectUrl, fileName) => {
    if (!workerRef) {
        console.error("Worker not initialized");
        return;
    }
    workerRef.postMessage({ command: 'writeObjectURLToFile', objectUrl: objectUrl, fileName: fileName});
};

export const onWorkerMessage = (callback) => {
    if (workerRef) {
        workerRef.onmessage = callback;
    }
};
