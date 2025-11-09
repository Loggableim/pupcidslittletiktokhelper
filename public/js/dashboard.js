// Socket.io Verbindung
const socket = io();

// State
let currentTab = 'events';
let settings = {};
let voices = {};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeButtons();
    initializeSocketListeners();
    loadSettings();
    loadVoices();
    loadVoiceMapping();
    loadFlows();
    setOverlayURL();
});

// ========== TABS ==========
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Button-States
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Content-States
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    currentTab = tabName;

    // Tab-spezifische Aktionen
    if (tabName === 'voices') {
        loadVoiceMapping();
    } else if (tabName === 'flows') {
        loadFlows();
    }
}

// ========== BUTTONS ==========
function initializeButtons() {
    // Connect Button
    document.getElementById('connect-btn').addEventListener('click', connect);

    // Disconnect Button
    document.getElementById('disconnect-btn').addEventListener('click', disconnect);

    // Enter-Taste im Username-Input
    document.getElementById('username-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') connect();
    });

    // Clear Events
    document.getElementById('clear-events-btn').addEventListener('click', () => {
        document.getElementById('event-log').innerHTML = '';
    });

    // Add Voice Button
    document.getElementById('add-voice-btn').addEventListener('click', showVoiceModal);

    // Modal Buttons
    document.getElementById('modal-save-btn').addEventListener('click', saveVoiceMapping);
    document.getElementById('modal-cancel-btn').addEventListener('click', hideVoiceModal);

    // Save Settings
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

    // Settings Range Inputs (Live-Update der Labels)
    document.getElementById('tts-volume').addEventListener('input', (e) => {
        document.getElementById('tts-volume-label').textContent = e.target.value;
    });
    document.getElementById('tts-speed').addEventListener('input', (e) => {
        document.getElementById('tts-speed-label').textContent = e.target.value;
    });
}

// ========== SOCKET.IO LISTENERS ==========
function initializeSocketListeners() {
    // Connection Status
    socket.on('tiktok:status', (data) => {
        updateConnectionStatus(data.status, data);
    });

    // Stats Update
    socket.on('tiktok:stats', (stats) => {
        updateStats(stats);
    });

    // Event
    socket.on('tiktok:event', (event) => {
        addEventToLog(event.type, event.data);
    });

    // Socket Connection
    socket.on('connect', () => {
        console.log('✅ Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
    });
}

// ========== TIKTOK CONNECTION ==========
async function connect() {
    const username = document.getElementById('username-input').value.trim();
    if (!username) {
        alert('Bitte gib einen TikTok-Usernamen ein!');
        return;
    }

    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        const result = await response.json();
        if (result.success) {
            console.log('✅ Connected to TikTok:', username);
        } else {
            alert('Connection failed: ' + result.error);
        }
    } catch (error) {
        console.error('Connection error:', error);
        alert('Connection error: ' + error.message);
    }
}

async function disconnect() {
    try {
        const response = await fetch('/api/disconnect', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            console.log('✅ Disconnected');
        }
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

function updateConnectionStatus(status, data = {}) {
    const statusEl = document.getElementById('connection-status');
    const infoEl = document.getElementById('connection-info');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');

    switch (status) {
        case 'connected':
            statusEl.className = 'status-badge status-connected';
            statusEl.textContent = '🟢 Connected';
            infoEl.textContent = `Connected to @${data.username}`;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'disconnected':
            statusEl.className = 'status-badge status-disconnected';
            statusEl.textContent = '⚫ Disconnected';
            infoEl.textContent = '';
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            break;

        case 'error':
            statusEl.className = 'status-badge status-error';
            statusEl.textContent = '🔴 Error';
            infoEl.textContent = `Error: ${data.error}`;
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            break;

        case 'stream_ended':
            statusEl.className = 'status-badge status-error';
            statusEl.textContent = '📺 Stream Ended';
            infoEl.textContent = 'The stream has ended';
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            break;
    }
}

// ========== STATS ==========
function updateStats(stats) {
    document.getElementById('stat-viewers').textContent = stats.viewers.toLocaleString();
    document.getElementById('stat-likes').textContent = stats.likes.toLocaleString();
    document.getElementById('stat-coins').textContent = stats.totalCoins.toLocaleString();
    document.getElementById('stat-followers').textContent = stats.followers.toLocaleString();
}

// ========== EVENT LOG ==========
function addEventToLog(type, data) {
    const logTable = document.getElementById('event-log');
    const row = document.createElement('tr');
    row.className = 'event-row border-b border-gray-700';

    const time = new Date().toLocaleTimeString();
    const username = data.username || data.uniqueId || 'Unknown';

    let details = '';
    let typeIcon = '';

    switch (type) {
        case 'chat':
            typeIcon = '💬 Chat';
            details = data.message;
            break;
        case 'gift':
            typeIcon = '🎁 Gift';
            details = `${data.giftName} x${data.repeatCount} (${data.coins} coins)`;
            break;
        case 'follow':
            typeIcon = '⭐ Follow';
            details = 'New follower!';
            break;
        case 'share':
            typeIcon = '🔄 Share';
            details = 'Shared the stream';
            break;
        case 'like':
            typeIcon = '❤️ Like';
            details = `${data.likeCount} likes`;
            break;
        case 'subscribe':
            typeIcon = '🌟 Subscribe';
            details = 'New subscriber!';
            break;
        default:
            typeIcon = '📌 ' + type;
            details = JSON.stringify(data);
    }

    row.innerHTML = `
        <td class="py-2 pr-4 text-gray-400">${time}</td>
        <td class="py-2 pr-4">${typeIcon}</td>
        <td class="py-2 pr-4 font-semibold">${username}</td>
        <td class="py-2">${details}</td>
    `;

    // Am Anfang einfügen (neueste oben)
    logTable.insertBefore(row, logTable.firstChild);

    // Maximal 100 Einträge behalten
    while (logTable.children.length > 100) {
        logTable.removeChild(logTable.lastChild);
    }
}

// ========== SETTINGS ==========
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        settings = await response.json();

        // Settings in UI laden
        document.getElementById('default-voice').value = settings.default_voice || 'en_us_ghostface';
        document.getElementById('tts-volume').value = settings.tts_volume || 80;
        document.getElementById('tts-volume-label').textContent = settings.tts_volume || 80;
        document.getElementById('tts-speed').value = settings.tts_speed || 1.0;
        document.getElementById('tts-speed-label').textContent = settings.tts_speed || 1.0;
        document.getElementById('tts-chat-enabled').checked = settings.tts_chat_enabled === 'true';

    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    const newSettings = {
        default_voice: document.getElementById('default-voice').value,
        tts_volume: document.getElementById('tts-volume').value,
        tts_speed: document.getElementById('tts-speed').value,
        tts_chat_enabled: document.getElementById('tts-chat-enabled').checked ? 'true' : 'false'
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Settings saved!');
            settings = newSettings;
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ Error saving settings!');
    }
}

// ========== VOICES ==========
async function loadVoices() {
    try {
        const response = await fetch('/api/voices/list');
        voices = await response.json();

        // Voice-Dropdowns füllen
        const voiceSelects = [
            document.getElementById('default-voice'),
            document.getElementById('modal-voice')
        ];

        voiceSelects.forEach(select => {
            select.innerHTML = '';
            Object.entries(voices).forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                select.appendChild(option);
            });
        });

    } catch (error) {
        console.error('Error loading voices:', error);
    }
}

// ========== VOICE MAPPING ==========
async function loadVoiceMapping() {
    try {
        const response = await fetch('/api/voices');
        const mappings = await response.json();

        const tbody = document.getElementById('voice-mapping-list');
        tbody.innerHTML = '';

        if (mappings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-gray-400">No voice mappings yet</td></tr>';
            return;
        }

        mappings.forEach(mapping => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-700';

            const voiceName = voices[mapping.voice] || mapping.voice;
            const lastUsed = mapping.last_used ? new Date(mapping.last_used).toLocaleString() : 'Never';

            row.innerHTML = `
                <td class="py-2 pr-4 font-semibold">${mapping.username}</td>
                <td class="py-2 pr-4">${voiceName}</td>
                <td class="py-2 pr-4 text-gray-400 text-sm">${lastUsed}</td>
                <td class="py-2">
                    <button onclick="deleteVoiceMapping('${mapping.username}')"
                            class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-700">
                        🗑️ Delete
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading voice mappings:', error);
    }
}

function showVoiceModal() {
    document.getElementById('modal-username').value = '';
    document.getElementById('voice-modal').classList.add('active');
}

function hideVoiceModal() {
    document.getElementById('voice-modal').classList.remove('active');
}

async function saveVoiceMapping() {
    const username = document.getElementById('modal-username').value.trim();
    const voice = document.getElementById('modal-voice').value;

    if (!username) {
        alert('Please enter a username!');
        return;
    }

    try {
        const response = await fetch('/api/voices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, voice })
        });

        const result = await response.json();
        if (result.success) {
            hideVoiceModal();
            loadVoiceMapping();
        }
    } catch (error) {
        console.error('Error saving voice mapping:', error);
        alert('Error saving voice mapping!');
    }
}

async function deleteVoiceMapping(username) {
    if (!confirm(`Delete voice mapping for ${username}?`)) return;

    try {
        const response = await fetch(`/api/voices/${username}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            loadVoiceMapping();
        }
    } catch (error) {
        console.error('Error deleting voice mapping:', error);
    }
}

// ========== FLOWS ==========
async function loadFlows() {
    try {
        const response = await fetch('/api/flows');
        const flows = await response.json();

        const container = document.getElementById('flows-list');
        container.innerHTML = '';

        if (flows.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8">No flows yet. Create one to get started!</div>';
            return;
        }

        flows.forEach(flow => {
            const flowDiv = document.createElement('div');
            flowDiv.className = 'bg-gray-700 rounded p-4';
            flowDiv.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h3 class="font-bold text-lg">${flow.name}</h3>
                        <div class="text-sm text-gray-400 mt-1">
                            Trigger: ${flow.trigger_type}
                            ${flow.trigger_condition ? ` (${flow.trigger_condition.field} ${flow.trigger_condition.operator} ${flow.trigger_condition.value})` : ''}
                        </div>
                        <div class="text-sm text-gray-400 mt-1">
                            Actions: ${flow.actions.length}
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="toggleFlow(${flow.id}, ${!flow.enabled})"
                                class="px-3 py-1 rounded text-sm ${flow.enabled ? 'bg-green-600' : 'bg-gray-600'}">
                            ${flow.enabled ? '✅ Enabled' : '⏸️ Disabled'}
                        </button>
                        <button onclick="deleteFlow(${flow.id})" class="bg-red-600 px-3 py-1 rounded text-sm hover:bg-red-700">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(flowDiv);
        });

    } catch (error) {
        console.error('Error loading flows:', error);
    }
}

async function toggleFlow(id, enabled) {
    try {
        const response = await fetch(`/api/flows/${id}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        const result = await response.json();
        if (result.success) {
            loadFlows();
        }
    } catch (error) {
        console.error('Error toggling flow:', error);
    }
}

async function deleteFlow(id) {
    if (!confirm('Delete this flow?')) return;

    try {
        const response = await fetch(`/api/flows/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadFlows();
        }
    } catch (error) {
        console.error('Error deleting flow:', error);
    }
}

// ========== OVERLAY ==========
function setOverlayURL() {
    const url = `${window.location.origin}/overlay.html`;
    document.getElementById('overlay-url').value = url;
}

function copyURL(elementId) {
    const input = document.getElementById(elementId);
    input.select();
    document.execCommand('copy');

    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 2000);
}
