const socket = io();
let state = {
    connected: false,
    currentScene: null,
    scenes: [],
    locked: false
};

// Socket.io Events
socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('multicam:join');
    loadState();
});

socket.on('multicam_state', (data) => {
    console.log('State update:', data);
    updateState(data);
});

socket.on('multicam_switch', (data) => {
    console.log('Switch event:', data);
    addLogEntry(data);
});

// State aktualisieren
function updateState(data) {
    state = { ...state, ...data };

    // Status-Anzeige
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const currentScene = document.getElementById('currentScene');
    const lockedBanner = document.getElementById('lockedBanner');

    if (state.connected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected to OBS';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }

    if (state.currentScene) {
        currentScene.innerHTML = `Current Scene: <strong>${state.currentScene}</strong>`;
    } else {
        currentScene.innerHTML = `Current Scene: <strong>-</strong>`;
    }

    if (state.locked) {
        lockedBanner.classList.add('active');
    } else {
        lockedBanner.classList.remove('active');
    }

    // Scene-Dropdown aktualisieren
    updateSceneSelect(state.scenes);
}

// Scene-Select aktualisieren
function updateSceneSelect(scenes) {
    const select = document.getElementById('sceneSelect');
    select.innerHTML = '<option value="">Select Scene...</option>';

    for (const scene of scenes) {
        const option = document.createElement('option');
        option.value = scene;
        option.textContent = scene;
        select.appendChild(option);
    }
}

// State laden
async function loadState() {
    try {
        const res = await fetch('/api/multicam/state');
        const data = await res.json();
        if (data.success) {
            updateState(data.state);
        }
    } catch (error) {
        console.error('Failed to load state:', error);
    }

    // Config laden für Hot Buttons
    loadConfig();
}

// Config laden
async function loadConfig() {
    try {
        const res = await fetch('/api/multicam/config');
        const data = await res.json();
        if (data.success) {
            renderHotButtons(data.config.ui.hotButtons);
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

// Hot Buttons rendern
function renderHotButtons(buttons) {
    const container = document.getElementById('hotButtons');
    container.innerHTML = '';

    for (const btn of buttons) {
        const button = document.createElement('button');
        button.className = 'hot-button';
        button.textContent = btn.label;
        button.addEventListener('click', () => executeHotButton(btn));
        container.appendChild(button);
    }
}

// Hot Button ausführen
async function executeHotButton(btn) {
    try {
        const res = await fetch('/api/multicam/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: btn.action, args: btn })
        });

        const data = await res.json();
        if (!data.success) {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Hot button error:', error);
        alert('Failed to execute action');
    }
}

// Connect OBS
async function connect() {
    try {
        const res = await fetch('/api/multicam/connect', { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
            alert(`Connection failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Connect error:', error);
        alert('Failed to connect');
    }
}

// Disconnect OBS
async function disconnect() {
    try {
        const res = await fetch('/api/multicam/disconnect', { method: 'POST' });
        const data = await res.json();
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

// Switch to selected scene
async function switchToSelected() {
    const select = document.getElementById('sceneSelect');
    const sceneName = select.value;

    if (!sceneName) {
        alert('Please select a scene');
        return;
    }

    try {
        const res = await fetch('/api/multicam/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'switchScene',
                args: { target: sceneName }
            })
        });

        const data = await res.json();
        if (!data.success) {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Switch error:', error);
        alert('Failed to switch scene');
    }
}

// Log-Eintrag hinzufügen
function addLogEntry(data) {
    const container = document.getElementById('logContainer');
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const time = new Date(data.timestamp).toLocaleTimeString();
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-user">${data.username}</span>
        <span class="log-action">${data.action}</span>
        <span class="log-target">${data.target || '-'}</span>
    `;

    // Oben einfügen
    if (container.firstChild) {
        container.insertBefore(entry, container.firstChild);
    } else {
        container.appendChild(entry);
    }

    // Maximal 50 Einträge behalten
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

// Set up event listeners
document.getElementById('obs-connect-btn').addEventListener('click', connect);
document.getElementById('obs-disconnect-btn').addEventListener('click', disconnect);
document.getElementById('switch-scene-btn').addEventListener('click', switchToSelected);

// Initial load
loadState();
