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
loadCustomPresets();

// Status alle 2 Sekunden aktualisieren
socket.emit('osc:get-status');
setInterval(() => {
    socket.emit('osc:get-status');
}, 2000);

// Custom OSC Action Form Handler
const customOscForm = document.getElementById('custom-osc-form');
if (customOscForm) {
    customOscForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const address = document.getElementById('custom-address').value;
        const valueInput = document.getElementById('custom-value').value;
        const duration = parseInt(document.getElementById('custom-duration').value) || 0;

        // Parse value - try to convert to appropriate type
        let value = valueInput;
        if (valueInput === 'true') value = true;
        else if (valueInput === 'false') value = false;
        else if (!isNaN(valueInput) && valueInput !== '') value = parseFloat(valueInput);

        await sendCustomOSC(address, value, duration);
    });
}

// Save Custom Preset Button
const btnSaveCustom = document.getElementById('btn-save-custom');
if (btnSaveCustom) {
    btnSaveCustom.addEventListener('click', () => {
        const address = document.getElementById('custom-address').value;
        const valueInput = document.getElementById('custom-value').value;
        const duration = parseInt(document.getElementById('custom-duration').value) || 0;

        if (!address) {
            alert('Bitte geben Sie eine OSC-Adresse ein');
            return;
        }

        saveCustomPreset(address, valueInput, duration);
    });
}

// Send Custom OSC Message
async function sendCustomOSC(address, value, duration = 0) {
    if (!address) {
        alert('Bitte geben Sie eine OSC-Adresse ein');
        return;
    }

    const response = await fetch('/api/osc/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: address,
            args: [value]
        })
    });

    const data = await response.json();

    if (data.success) {
        console.log('Custom OSC sent:', address, value);
        
        // Auto-reset if duration is set
        if (duration > 0) {
            setTimeout(async () => {
                await fetch('/api/osc/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        address: address,
                        args: [0]
                    })
                });
            }, duration);
        }
    } else {
        alert('Fehler beim Senden: ' + (data.error || 'OSC-Bridge nicht aktiv'));
    }
}

// Save Custom Preset to localStorage
function saveCustomPreset(address, value, duration) {
    let presets = JSON.parse(localStorage.getItem('osc-custom-presets') || '[]');
    
    // Create a name from the address
    const name = address.split('/').pop() || address;
    
    const preset = {
        id: Date.now(),
        name: name,
        address: address,
        value: value,
        duration: duration
    };

    presets.push(preset);
    localStorage.setItem('osc-custom-presets', JSON.stringify(presets));
    
    loadCustomPresets();
    alert('Preset gespeichert!');
}

// Load Custom Presets from localStorage
function loadCustomPresets() {
    const presets = JSON.parse(localStorage.getItem('osc-custom-presets') || '[]');
    const container = document.getElementById('presets-container');
    
    if (!container) return;
    
    if (presets.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.9em;">Keine Presets gespeichert</p>';
        return;
    }

    container.innerHTML = presets.map(preset => `
        <button class="param-btn" data-preset-id="${preset.id}">
            🎯 ${preset.name}
            <small style="display: block; font-size: 0.8em; opacity: 0.7;">${preset.address}</small>
        </button>
    `).join('');

    // Add click handlers to preset buttons
    container.querySelectorAll('.param-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetId = parseInt(btn.dataset.presetId);
            const preset = presets.find(p => p.id === presetId);
            if (preset) {
                let value = preset.value;
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (!isNaN(value) && value !== '') value = parseFloat(value);
                
                sendCustomOSC(preset.address, value, preset.duration);
            }
        });
        
        // Add right-click to delete
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const presetId = parseInt(btn.dataset.presetId);
            if (confirm('Preset löschen?')) {
                deleteCustomPreset(presetId);
            }
        });
    });
}

// Delete Custom Preset
function deleteCustomPreset(presetId) {
    let presets = JSON.parse(localStorage.getItem('osc-custom-presets') || '[]');
    presets = presets.filter(p => p.id !== presetId);
    localStorage.setItem('osc-custom-presets', JSON.stringify(presets));
    loadCustomPresets();
}
