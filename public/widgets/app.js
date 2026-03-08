// --- Global state ---
let sharePort = null;
let currentSelection = [];

const controls = {
    loadModelBtn: document.getElementById('loadModelBtn'),
    hideBtn: document.getElementById('hideBtn'),
    unhideAllBtn: document.getElementById('unhideAllBtn'),
};

// --- Helper to log events to the screen ---
function logEvent(message) {
    const logList = document.getElementById('event-log');
    const listItem = document.createElement('li');
    listItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logList.prepend(listItem);
}

// --- Handlers for specific messages from Share ---
const messageHandlers = {
    'ai.bldrs-share.SelectionChanged': (data) => {
        currentSelection = data.current;
        logEvent(`Selection changed. ${currentSelection.length} elements selected.`);
    },
    'ai.bldrs-share.ModelLoaded': (data) => {
        logEvent('Model loaded event received.');
        console.log('ModelLoaded data:', data);
    },
    'ai.bldrs-share.HiddenElements': (data) => {
        logEvent(`${data.current.length} elements are now hidden.`);
    }
};

// --- Main message handler for the established port ---
function onShareMessage(event) {
    const { action, data } = event.data;
    if (action && messageHandlers[action]) {
        messageHandlers[action](data);
    } else {
        logEvent(`Received unhandled action: ${action || 'unknown'}`);
        console.log('Received unhandled message:', event.data);
    }
}

// --- Handshake Step 2: Listen for the host's response ---
// This function is the same, but it will now be triggered by our request.
function initPort(event) {
    if (event.data === "init" && event.ports[0]) {
        logEvent("Connection established with Share host.");
        sharePort = event.ports[0];
        sharePort.onmessage = onShareMessage;
        
        // Enable controls now that we are connected
        for (const control of Object.values(controls)) {
            control.disabled = false;
        }
        window.removeEventListener("message", initPort); // Clean up listener
    }
}

// This listener is set up first, ready to catch the response.
window.addEventListener("message", initPort);

// --- Handshake Step 1: Proactively request the communication channel from the host ---
// This is the NEW and CRITICAL part.
logEvent("Applet loaded. Requesting communication channel from Share host...");
window.parent.postMessage('request-channel', '*');


// --- UI Event Listeners to send commands to Share ---
controls.loadModelBtn.addEventListener('click', () => {
    if (!sharePort) return;
    logEvent("Sending 'LoadModel' command...");
    // THIS IS A KEY CORRECTION: The payload must be an object with 'action' and 'data'.
    sharePort.postMessage({
        action: 'ai.bldrs-share.LoadModel',
        data: {
            githubIfcPath: 'Swiss-Property-AG/Momentum-Public/main/Momentum.ifc'
        }
    });
});

controls.hideBtn.addEventListener('click', () => {
    if (!sharePort || currentSelection.length === 0) {
        logEvent("Cannot hide. No elements selected.");
        return;
    }
    logEvent(`Sending 'HideElements' for ${currentSelection.length} elements...`);
    sharePort.postMessage({
        action: 'ai.bldrs-share.HideElements',
        data: { globalIds: currentSelection }
    });
});

controls.unhideAllBtn.addEventListener('click', () => {
    if (!sharePort) return;
    logEvent("Sending 'UnhideElements' command...");
    sharePort.postMessage({
        action: 'ai.bldrs-share.UnhideElements',
        data: { globalIds: ['*'] }
    });
});