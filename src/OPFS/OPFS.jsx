import React, { useEffect, useRef } from 'react';
import Worker from 'worker-loader!./OPFSWorker.js'; 

const OPFS = () => {
    const workerRef = useRef();

    useEffect(() => {
        // Initialize the worker
        workerRef.current = new Worker();

        // Handle messages received from the worker
        workerRef.current.onmessage = (event) => {
            if (event.data.error) {
                console.error('Error from worker:', event.data.error);
            } else {
                // Handle successful operations or data
                console.log('Response from worker:', event.data);
            }
        };

        // Clean up the worker when the component unmounts
        return () => {
            workerRef.current.terminate();
        };
    }, []);

    async function opfsTesting(objectUrl) {
        // Send a message to the worker to perform OPFS operations
        workerRef.current.postMessage(
        { 
            command: 'accessOPFS',
            objectUrl: objectUrl
        });
    }

    return true;
};

export default OPFS;