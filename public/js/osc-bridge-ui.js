const socket = io();
let currentConfig = {};

// Status-Updates empfangen
socket.on('osc:status', (status) => {
    updateStatus(status);
});

// OSC-Nachrichten loggen (wenn verbose)
socket.on('osc:sent', (data) => {
    if (currentConfig.verboseMode) {
        addLog('send', `${data.address} → ${JSON.stringify(data.args)}`);
    }
});

socket.on('osc:received', (data) => {
    if (currentConfig.verboseMode) {
        addLog('recv', `${data.address} ← ${JSON.stringify(data.args)} from ${data.source}`);
    }
});

// Config laden
async function loadConfig() {
    const response = await fetch('/api/osc/config');
    const data = await response.json();

    if (data.success) {
        currentConfig = data.config;
        populateForm(currentConfig);
        toggleLogViewer(currentConfig.verboseMode);
    }
}

function populateForm(config) {
    document.getElementById('enabled').checked = config.enabled || false;
    document.getElementById('sendHost').value = config.sendHost || '127.0.0.1';
    document.getElementById('sendPort').value = config.sendPort || 9000;
    document.getElementById('receivePort').value = config.receivePort || 9001;
    document.getElementById('verboseMode').checked = config.verboseMode || false;
}

function toggleLogViewer(show) {
    document.getElementById('log-card').style.display = show ? 'block' : 'none';
}

// Status aktualisieren
function updateStatus(status) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    if (status.isRunning) {
        indicator.className = 'status-indicator running';
        statusText.textContent = 'Aktiv';
    } else {
        indicator.className = 'status-indicator stopped';
        statusText.textContent = 'Gestoppt';
    }

    // Statistiken
    document.getElementById('stat-sent').textContent = status.stats.messagesSent || 0;
    document.getElementById('stat-received').textContent = status.stats.messagesReceived || 0;
    document.getElementById('stat-errors').textContent = status.stats.errors || 0;
    document.getElementById('stat-uptime').textContent = formatUptime(status.uptime || 0);
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

// Config speichern
const configForm = document.getElementById('config-form');
if (configForm) {
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const enabled = document.getElementById('enabled');
        const sendHost = document.getElementById('sendHost');
        const sendPort = document.getElementById('sendPort');
        const receivePort = document.getElementById('receivePort');
        const verboseMode = document.getElementById('verboseMode');

        if (!enabled || !sendHost || !sendPort || !receivePort || !verboseMode) {
            console.warn('Config form elements not found');
            return;
        }

        const config = {
            enabled: enabled.checked,
            sendHost: sendHost.value,
            sendPort: parseInt(sendPort.value),
            receivePort: parseInt(receivePort.value),
            verboseMode: verboseMode.checked
        };

    const response = await fetch('/api/osc/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });

    const data = await response.json();

        if (data.success) {
            alert('Konfiguration gespeichert!');
            currentConfig = data.config;
            toggleLogViewer(currentConfig.verboseMode);
        } else {
            alert('Fehler beim Speichern: ' + data.error);
        }
    });
}

// Bridge starten/stoppen
const btnStart = document.getElementById('btn-start');
if (btnStart) {
    btnStart.addEventListener('click', async () => {
        const response = await fetch('/api/osc/start', { method: 'POST' });
        const data = await response.json();

        if (!data.success) {
            alert('Fehler beim Starten: ' + data.error);
        }
    });
}

const btnStop = document.getElementById('btn-stop');
if (btnStop) {
    btnStop.addEventListener('click', async () => {
        const response = await fetch('/api/osc/stop', { method: 'POST' });
        const data = await response.json();

        if (!data.success) {
            alert('Fehler beim Stoppen: ' + data.error);
        }
    });
}

// Test-Signal
const btnTest = document.getElementById('btn-test');
if (btnTest) {
    btnTest.addEventListener('click', async () => {
        const response = await fetch('/api/osc/test', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            alert(`Test-Signal gesendet: ${data.address} = ${data.value}`);
        } else {
            alert('Fehler: ' + data.error);
        }
    });
}

// VRChat Parameter senden
async function sendVRChatParam(action, slot) {
    let endpoint = `/api/osc/vrchat/${action}`;

    const body = {};
    if (action === 'emote') {
        body.slot = slot;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.success) {
        alert('Fehler: OSC-Bridge nicht aktiv');
    }
}

// VRChat Parameter Button Event Listeners
document.querySelectorAll('.param-btn').forEach(button => {
    button.addEventListener('click', () => {
        const action = button.dataset.action;
        const slot = button.dataset.slot;

        if (action === 'emote' && slot !== undefined) {
            sendVRChatParam(action, parseInt(slot));
        } else {
            sendVRChatParam(action);
        }
    });
});

// Log-Einträge hinzufügen
function addLog(type, message) {
    const logViewer = document.getElementById('log-viewer');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logViewer.insertBefore(entry, logViewer.firstChild);

    // Limit: 100 Einträge
    while (logViewer.children.length > 100) {
        logViewer.removeChild(logViewer.lastChild);
    }
}

// Initial laden
loadConfig();

// Status alle 2 Sekunden aktualisieren
socket.emit('osc:get-status');
setInterval(() => {
    socket.emit('osc:get-status');
}, 2000);
