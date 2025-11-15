// Socket.io Verbindung - delayed until DOM ready to avoid race conditions
let socket = null;

// State
let currentTab = 'events';
let settings = {};
// voices wird vom tts_core_v2 Plugin verwaltet

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize socket connection after DOM is ready
    socket = io();

    // Initialize UI first, dann Plugins checken (non-blocking)
    initializeButtons();
    initializeSocketListeners();

    // Dann asynchron (ohne await) laden - blockiert nicht die UI
    loadSettings().catch(err => console.error('Settings load failed:', err));
    // loadVoices und loadVoiceMapping werden vom tts_core_v2 Plugin verwaltet
    loadFlows().catch(err => console.error('Flows load failed:', err));
    loadActiveProfile().catch(err => console.error('Profile load failed:', err));
});

// ========== TABS (Legacy - now handled by navigation.js) ==========
// Tab functions removed - navigation is now handled by navigation.js
// View switching is done through NavigationManager.switchView()

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

    // TTS Voice Buttons (nur wenn Elemente existieren - Plugin könnte diese zur Verfügung stellen)
    const addVoiceBtn = document.getElementById('add-voice-btn');
    if (addVoiceBtn) {
        addVoiceBtn.addEventListener('click', showVoiceModal);
    }

    const modalSaveBtn = document.getElementById('modal-save-btn');
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', saveVoiceMapping);
    }

    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideVoiceModal);
    }

    // Flow Buttons
    const addFlowBtn = document.getElementById('add-flow-btn');
    if (addFlowBtn) {
        addFlowBtn.addEventListener('click', showCreateFlowModal);
    }

    const flowModalSaveBtn = document.getElementById('flow-modal-save-btn');
    if (flowModalSaveBtn) {
        flowModalSaveBtn.addEventListener('click', saveNewFlow);
    }

    const flowModalCancelBtn = document.getElementById('flow-modal-cancel-btn');
    if (flowModalCancelBtn) {
        flowModalCancelBtn.addEventListener('click', hideCreateFlowModal);
    }

    const flowModalClose = document.getElementById('flow-modal-close');
    if (flowModalClose) {
        flowModalClose.addEventListener('click', hideCreateFlowModal);
    }

    // Flow Action Type Change (show/hide settings)
    const flowActionType = document.getElementById('flow-action-type');
    if (flowActionType) {
        flowActionType.addEventListener('change', (e) => {
            const alertSettings = document.getElementById('alert-settings');
            const webhookSettings = document.getElementById('webhook-settings');

            if (e.target.value === 'alert') {
                alertSettings.style.display = 'block';
                webhookSettings.style.display = 'none';
            } else if (e.target.value === 'webhook') {
                alertSettings.style.display = 'none';
                webhookSettings.style.display = 'block';
            }
        });
    }

    // Profile Buttons
    document.getElementById('profile-btn').addEventListener('click', showProfileModal);
    document.getElementById('profile-modal-close').addEventListener('click', hideProfileModal);
    document.getElementById('create-profile-btn').addEventListener('click', createProfile);

    // Enter-Taste im Profile-Input
    document.getElementById('new-profile-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createProfile();
    });

    // TTS Settings Buttons (nur wenn Elemente existieren - Plugin könnte diese zur Verfügung stellen)
    const saveTTSBtn = document.getElementById('save-tts-settings-btn');
    if (saveTTSBtn) {
        saveTTSBtn.addEventListener('click', saveTTSSettings);
    }

    const ttsTestBtn = document.getElementById('tts-test-btn');
    if (ttsTestBtn) {
        ttsTestBtn.addEventListener('click', testTTS);
    }

    const ttsProviderSelect = document.getElementById('tts-provider');
    if (ttsProviderSelect) {
        ttsProviderSelect.addEventListener('change', onTTSProviderChange);
    }

    // Settings Range Inputs (Live-Update der Labels)
    const ttsVolume = document.getElementById('tts-volume');
    if (ttsVolume) {
        ttsVolume.addEventListener('input', (e) => {
            const label = document.getElementById('tts-volume-label');
            if (label) label.textContent = e.target.value;
        });
    }

    const ttsSpeed = document.getElementById('tts-speed');
    if (ttsSpeed) {
        ttsSpeed.addEventListener('input', (e) => {
            const label = document.getElementById('tts-speed-label');
            if (label) label.textContent = e.target.value;
        });
    }

    // Auto-start toggle
    const autostartCheckbox = document.getElementById('autostart-enabled');
    if (autostartCheckbox) {
        autostartCheckbox.addEventListener('change', (e) => {
            toggleAutoStart(e.target.checked);
        });
    }

    // Preset management buttons
    const exportBtn = document.getElementById('export-preset-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPreset);
    }

    const importBtn = document.getElementById('import-preset-btn');
    if (importBtn) {
        importBtn.addEventListener('click', importPreset);
    }

    // Resource Monitor - Save button
    const saveResourceMonitorBtn = document.getElementById('save-resource-monitor-settings');
    if (saveResourceMonitorBtn) {
        saveResourceMonitorBtn.addEventListener('click', saveResourceMonitorSettings);
    }

    // Resource Monitor - Interval slider live update
    const resourceMonitorInterval = document.getElementById('resource-monitor-interval');
    if (resourceMonitorInterval) {
        resourceMonitorInterval.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            const label = document.getElementById('resource-monitor-interval-label');
            if (label) {
                label.textContent = (value / 1000).toFixed(1) + 's';
            }
        });
    }
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

    // ========== AUDIO PLAYBACK (Dashboard) ==========
    // TTS Playback im Dashboard
    socket.on('tts:play', (data) => {
        playDashboardTTS(data);
    });

    // Soundboard Playback im Dashboard
    socket.on('soundboard:play', (data) => {
        playDashboardSoundboard(data);
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
    const infoEl = document.getElementById('connection-info');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');

    // Update status badge via NavigationManager
    if (window.NavigationManager) {
        window.NavigationManager.updateConnectionStatus(status, data);
    }

    switch (status) {
        case 'connected':
            infoEl.innerHTML = `<div class="text-green-400 text-sm">Connected to @${data.username}</div>`;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'disconnected':
            infoEl.textContent = '';
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            break;

        case 'retrying':
            infoEl.innerHTML = `
                <div class="p-3 bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded">
                    <div class="font-semibold text-yellow-300">Verbindung wird wiederholt...</div>
                    <div class="text-sm text-yellow-200 mt-1">${data.error}</div>
                    <div class="text-xs text-yellow-400 mt-2">
                        ⏳ Nächster Versuch in ${(data.delay / 1000).toFixed(0)} Sekunden (Versuch ${data.attempt}/${data.maxRetries})
                    </div>
                </div>
            `;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            break;

        case 'error':
            // Detaillierte Fehleranzeige mit Type und Suggestion
            let errorHtml = `
                <div class="p-3 bg-red-900 bg-opacity-50 border border-red-600 rounded">
                    <div class="font-semibold text-red-300">${data.type || 'Verbindungsfehler'}</div>
                    <div class="text-sm text-red-200 mt-1">${data.error}</div>
            `;

            if (data.suggestion) {
                errorHtml += `
                    <div class="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-300">
                        <div class="font-semibold text-blue-400 mb-1">💡 Lösungsvorschlag:</div>
                        ${data.suggestion}
                    </div>
                `;
            }

            if (data.retryable === false) {
                errorHtml += `
                    <div class="mt-2 text-xs text-red-400">
                        ⚠️ Dieser Fehler kann nicht automatisch behoben werden.
                    </div>
                `;
            }

            errorHtml += `</div>`;

            infoEl.innerHTML = errorHtml;
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            break;

        case 'stream_ended':
            infoEl.innerHTML = '<div class="text-gray-400 text-sm">The stream has ended</div>';
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

    // Update gifts counter if available
    const giftsElement = document.getElementById('stat-gifts');
    if (giftsElement) {
        // Use stats.gifts if available, otherwise fallback to counting gifts from events
        giftsElement.textContent = (stats.gifts || 0).toLocaleString();
    }
}

// ========== EVENT LOG ==========
function addEventToLog(type, data) {
    const logTable = document.getElementById('event-log');
    const row = document.createElement('tr');
    row.className = 'event-row border-b border-gray-700';

    const time = new Date().toLocaleTimeString();
    const username = data.username || data.uniqueId || data.nickname || 'Viewer';

    let details = '';
    let typeIcon = '';

    switch (type) {
        case 'chat':
            typeIcon = '💬 Chat';
            details = data.message;
            break;
        case 'gift':
            typeIcon = '🎁 Gift';
            const giftName = data.giftName || (data.giftId ? `Gift #${data.giftId}` : 'Unknown Gift');
            details = `${giftName} x${data.repeatCount} (${data.coins} coins)`;
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

        // Settings in UI laden (falls Elemente existieren)
        // TTS-Settings werden nun vom tts_core_v2 Plugin verwaltet

    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    const newSettings = {
        // TTS-Settings werden nun vom tts_core_v2 Plugin verwaltet
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
async function loadVoices(provider = null) {
    try {
        // Wenn kein Provider angegeben, aus Settings laden
        if (!provider) {
            provider = settings.tts_provider || 'tiktok';
        }

        const response = await fetch('/api/tts-v2/voices');
        const data = await response.json();
        voices = data.voices || {};

        // Voice-Dropdowns füllen
        const voiceSelects = [
            document.getElementById('default-voice'),
            document.getElementById('modal-voice')
        ];

        voiceSelects.forEach(select => {
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '';

            Object.entries(voices).forEach(([id, name]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                select.appendChild(option);
            });

            // Versuche den vorherigen Wert wiederherzustellen
            if (currentValue && voices[currentValue]) {
                select.value = currentValue;
            }
        });

    } catch (error) {
        console.error('Error loading voices:', error);
    }
}

// ========== VOICE MAPPING ==========
async function loadVoiceMapping() {
    try {
        const response = await fetch('/api/tts-v2/user-voices');
        const data = await response.json();
        const mappings = data.mappings || [];

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
        const response = await fetch('/api/tts-v2/user-voice', {
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
        const response = await fetch(`/api/tts-v2/user-voice/${username}`, {
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

// ========== FLOW EDITOR MODAL ==========
function showCreateFlowModal() {
    // Reset form
    document.getElementById('flow-name').value = '';
    document.getElementById('flow-trigger-type').value = 'gift';
    document.getElementById('flow-action-type').value = 'alert';
    document.getElementById('flow-action-text').value = '';

    // Show modal
    document.getElementById('flow-modal').classList.add('active');
}

function hideCreateFlowModal() {
    document.getElementById('flow-modal').classList.remove('active');
}

async function saveNewFlow() {
    const name = document.getElementById('flow-name').value.trim();
    const triggerType = document.getElementById('flow-trigger-type').value;
    const actionType = document.getElementById('flow-action-type').value;
    const actionText = document.getElementById('flow-action-text').value.trim();

    if (!name) {
        alert('Please enter a flow name!');
        return;
    }

    if (actionType === 'alert' && !actionText) {
        alert('Please enter alert text!');
        return;
    }

    // Build flow object
    const flow = {
        name: name,
        trigger_type: triggerType,
        trigger_condition: null, // Basic flow without conditions
        actions: [],
        enabled: true
    };

    // Add action based on type
    if (actionType === 'alert') {
        flow.actions.push({
            type: 'alert',
            text: actionText,
            duration: 5,
            sound_file: null,
            volume: 80
        });
    } else if (actionType === 'webhook') {
        const webhookUrl = document.getElementById('flow-webhook-url').value.trim();
        if (!webhookUrl) {
            alert('Please enter a webhook URL!');
            return;
        }
        flow.actions.push({
            type: 'webhook',
            method: 'POST',
            url: webhookUrl
        });
    }

    try {
        const response = await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flow)
        });

        const result = await response.json();
        if (result.success) {
            alert(`✅ Flow "${name}" created successfully!`);
            hideCreateFlowModal();
            loadFlows();
        } else {
            alert('❌ Error creating flow: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating flow:', error);
        alert('❌ Error creating flow!');
    }
}

// ========== SOUNDBOARD ==========
async function loadSoundboardSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Load settings into UI
        document.getElementById('soundboard-enabled').checked = settings.soundboard_enabled === 'true';
        document.getElementById('soundboard-play-mode').value = settings.soundboard_play_mode || 'overlap';
        document.getElementById('soundboard-max-queue').value = settings.soundboard_max_queue_length || '10';

        // Event sounds
        document.getElementById('soundboard-follow-url').value = settings.soundboard_follow_sound || '';
        document.getElementById('soundboard-follow-volume').value = settings.soundboard_follow_volume || '1.0';
        document.getElementById('soundboard-subscribe-url').value = settings.soundboard_subscribe_sound || '';
        document.getElementById('soundboard-subscribe-volume').value = settings.soundboard_subscribe_volume || '1.0';
        document.getElementById('soundboard-share-url').value = settings.soundboard_share_sound || '';
        document.getElementById('soundboard-share-volume').value = settings.soundboard_share_volume || '1.0';
        document.getElementById('soundboard-gift-url').value = settings.soundboard_default_gift_sound || '';
        document.getElementById('soundboard-gift-volume').value = settings.soundboard_gift_volume || '1.0';
        document.getElementById('soundboard-like-url').value = settings.soundboard_like_sound || '';
        document.getElementById('soundboard-like-volume').value = settings.soundboard_like_volume || '1.0';
        document.getElementById('soundboard-like-threshold').value = settings.soundboard_like_threshold || '0';
        document.getElementById('soundboard-like-window').value = settings.soundboard_like_window_seconds || '10';

    } catch (error) {
        console.error('Error loading soundboard settings:', error);
    }
}

async function saveSoundboardSettings() {
    const newSettings = {
        soundboard_enabled: document.getElementById('soundboard-enabled').checked ? 'true' : 'false',
        soundboard_play_mode: document.getElementById('soundboard-play-mode').value,
        soundboard_max_queue_length: document.getElementById('soundboard-max-queue').value,
        soundboard_follow_sound: document.getElementById('soundboard-follow-url').value,
        soundboard_follow_volume: document.getElementById('soundboard-follow-volume').value,
        soundboard_subscribe_sound: document.getElementById('soundboard-subscribe-url').value,
        soundboard_subscribe_volume: document.getElementById('soundboard-subscribe-volume').value,
        soundboard_share_sound: document.getElementById('soundboard-share-url').value,
        soundboard_share_volume: document.getElementById('soundboard-share-volume').value,
        soundboard_default_gift_sound: document.getElementById('soundboard-gift-url').value,
        soundboard_gift_volume: document.getElementById('soundboard-gift-volume').value,
        soundboard_like_sound: document.getElementById('soundboard-like-url').value,
        soundboard_like_volume: document.getElementById('soundboard-like-volume').value,
        soundboard_like_threshold: document.getElementById('soundboard-like-threshold').value,
        soundboard_like_window_seconds: document.getElementById('soundboard-like-window').value
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Soundboard settings saved!');
        }
    } catch (error) {
        console.error('Error saving soundboard settings:', error);
        alert('❌ Error saving settings!');
    }
}

async function loadGiftSounds() {
    try {
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();

        const tbody = document.getElementById('gift-sounds-list');
        tbody.innerHTML = '';

        if (gifts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-gray-400">No gift sounds configured yet</td></tr>';
            return;
        }

        gifts.forEach(gift => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-700';

            const animationInfo = gift.animationUrl && gift.animationType !== 'none'
                ? `<span class="text-green-400">${gift.animationType}</span>`
                : '<span class="text-gray-500">none</span>';

            row.innerHTML = `
                <td class="py-2 pr-4">${gift.giftId}</td>
                <td class="py-2 pr-4 font-semibold">${gift.label}</td>
                <td class="py-2 pr-4 text-sm truncate max-w-xs">${gift.mp3Url}</td>
                <td class="py-2 pr-4">${gift.volume}</td>
                <td class="py-2 pr-4">${animationInfo}</td>
                <td class="py-2">
                    <button onclick="testGiftSound('${gift.mp3Url}', ${gift.volume})"
                            class="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700 mr-1">
                        🔊 Test
                    </button>
                    <button onclick="deleteGiftSound(${gift.giftId})"
                            class="bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700">
                        🗑️ Delete
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading gift sounds:', error);
    }
}

async function addGiftSound() {
    const giftId = document.getElementById('new-gift-id').value;
    const label = document.getElementById('new-gift-label').value;
    const url = document.getElementById('new-gift-url').value;
    const volume = document.getElementById('new-gift-volume').value;
    const animationUrl = document.getElementById('new-gift-animation-url').value;
    const animationType = document.getElementById('new-gift-animation-type').value;

    if (!giftId || !label || !url) {
        alert('Please select a gift from the catalog above and enter a sound URL!');
        return;
    }

    try {
        const response = await fetch('/api/soundboard/gifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giftId: parseInt(giftId),
                label: label,
                mp3Url: url,
                volume: parseFloat(volume),
                animationUrl: animationUrl || null,
                animationType: animationType || 'none'
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Gift sound added/updated successfully!');

            // Clear inputs
            clearGiftSoundForm();

            // Reload lists
            await loadGiftSounds();
            await loadGiftCatalog(); // Reload catalog to update checkmarks
        }
    } catch (error) {
        console.error('Error adding gift sound:', error);
        alert('Error adding gift sound!');
    }
}

async function deleteGiftSound(giftId) {
    if (!confirm(`Delete sound for Gift ID ${giftId}?`)) return;

    try {
        const response = await fetch(`/api/soundboard/gifts/${giftId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            await loadGiftSounds();
            await loadGiftCatalog(); // Reload catalog to update checkmarks
        }
    } catch (error) {
        console.error('Error deleting gift sound:', error);
    }
}

async function testGiftSound(url, volume) {
    try {
        await fetch('/api/soundboard/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, volume })
        });
    } catch (error) {
        console.error('Error testing sound:', error);
    }
}

async function testEventSound(eventType) {
    let url, volume;

    switch (eventType) {
        case 'follow':
            url = document.getElementById('soundboard-follow-url').value;
            volume = document.getElementById('soundboard-follow-volume').value;
            break;
        case 'subscribe':
            url = document.getElementById('soundboard-subscribe-url').value;
            volume = document.getElementById('soundboard-subscribe-volume').value;
            break;
        case 'share':
            url = document.getElementById('soundboard-share-url').value;
            volume = document.getElementById('soundboard-share-volume').value;
            break;
        case 'gift':
            url = document.getElementById('soundboard-gift-url').value;
            volume = document.getElementById('soundboard-gift-volume').value;
            break;
        case 'like':
            url = document.getElementById('soundboard-like-url').value;
            volume = document.getElementById('soundboard-like-volume').value;
            break;
    }

    if (!url) {
        alert('Please enter a sound URL first!');
        return;
    }

    try {
        await fetch('/api/soundboard/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, volume: parseFloat(volume) })
        });
    } catch (error) {
        console.error('Error testing sound:', error);
    }
}

async function searchMyInstants() {
    const query = document.getElementById('myinstants-search-input').value;

    if (!query) {
        alert('Please enter a search query!');
        return;
    }

    const resultsDiv = document.getElementById('myinstants-results');
    resultsDiv.innerHTML = '<div class="text-gray-400 text-sm">🔍 Searching...</div>';

    try {
        const response = await fetch(`/api/myinstants/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!data.success || data.results.length === 0) {
            resultsDiv.innerHTML = '<div class="text-gray-400 text-sm">No results found</div>';
            return;
        }

        resultsDiv.innerHTML = '';
        data.results.forEach(sound => {
            const div = document.createElement('div');
            div.className = 'bg-gray-600 p-2 rounded flex items-center justify-between';
            div.innerHTML = `
                <div class="flex-1">
                    <div class="font-semibold text-sm">${sound.name}</div>
                    <div class="text-xs text-gray-400 truncate">${sound.url}</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="testGiftSound('${sound.url}', 1.0)"
                            class="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700">
                        🔊
                    </button>
                    <button onclick="useMyInstantsSound('${sound.name}', '${sound.url}')"
                            class="bg-green-600 px-2 py-1 rounded text-xs hover:bg-green-700">
                        Use
                    </button>
                </div>
            `;
            resultsDiv.appendChild(div);
        });

    } catch (error) {
        console.error('Error searching MyInstants:', error);
        resultsDiv.innerHTML = '<div class="text-red-400 text-sm">Error searching MyInstants</div>';
    }
}

function useMyInstantsSound(name, url) {
    document.getElementById('new-gift-label').value = name;
    document.getElementById('new-gift-url').value = url;
}

// ========== GIFT CATALOG ==========
async function loadGiftCatalog() {
    try {
        const response = await fetch('/api/gift-catalog');
        const data = await response.json();

        const infoDiv = document.getElementById('gift-catalog-info');
        const catalogDiv = document.getElementById('gift-catalog-list');

        if (!data.success) {
            infoDiv.innerHTML = '<span class="text-red-400">Error loading gift catalog</span>';
            catalogDiv.innerHTML = '';
            return;
        }

        const catalog = data.catalog || [];
        const lastUpdate = data.lastUpdate;

        // Info anzeigen
        if (catalog.length === 0) {
            infoDiv.innerHTML = `
                <span class="text-yellow-400">⚠️ No gifts in catalog. Connect to a stream and click "Refresh Catalog"</span>
            `;
            catalogDiv.innerHTML = '';
            return;
        }

        const updateText = lastUpdate ? `Last updated: ${new Date(lastUpdate).toLocaleString()}` : 'Never updated';
        infoDiv.innerHTML = `
            <span class="text-green-400">✅ ${catalog.length} gifts available</span>
            <span class="mx-2">•</span>
            <span class="text-gray-400">${updateText}</span>
        `;

        // Katalog anzeigen
        catalogDiv.innerHTML = '';
        catalog.forEach(gift => {
            const giftCard = document.createElement('div');
            giftCard.className = 'bg-gray-600 p-3 rounded cursor-pointer hover:bg-gray-500 transition flex flex-col items-center';
            giftCard.onclick = () => selectGift(gift);

            const hasSound = isGiftConfigured(gift.id);
            const borderClass = hasSound ? 'border-2 border-green-500' : '';

            giftCard.innerHTML = `
                <div class="relative ${borderClass} rounded">
                    ${gift.image_url
                        ? `<img src="${gift.image_url}" alt="${gift.name}" class="w-16 h-16 object-contain rounded">`
                        : `<div class="w-16 h-16 flex items-center justify-center text-3xl">🎁</div>`
                    }
                    ${hasSound ? '<div class="absolute -top-1 -right-1 bg-green-500 rounded-full w-4 h-4 flex items-center justify-center text-xs">✓</div>' : ''}
                </div>
                <div class="text-xs text-center mt-2 font-semibold truncate w-full">${gift.name}</div>
                <div class="text-xs text-gray-400">ID: ${gift.id}</div>
                ${gift.diamond_count ? `<div class="text-xs text-yellow-400">💎 ${gift.diamond_count}</div>` : ''}
            `;

            catalogDiv.appendChild(giftCard);
        });

    } catch (error) {
        console.error('Error loading gift catalog:', error);
        document.getElementById('gift-catalog-info').innerHTML = '<span class="text-red-400">Error loading catalog</span>';
    }
}

function isGiftConfigured(giftId) {
    // Prüfe ob ein Sound für dieses Gift bereits konfiguriert ist
    const table = document.getElementById('gift-sounds-list');
    if (!table) return false;

    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
        const firstCell = row.querySelector('td:first-child');
        if (firstCell && parseInt(firstCell.textContent) === giftId) {
            return true;
        }
    }
    return false;
}

async function refreshGiftCatalog() {
    const btn = document.getElementById('refresh-catalog-btn');
    const icon = document.getElementById('refresh-icon');
    const infoDiv = document.getElementById('gift-catalog-info');

    // Button deaktivieren und Animation starten
    btn.disabled = true;
    icon.style.animation = 'spin 1s linear infinite';
    icon.style.display = 'inline-block';
    infoDiv.innerHTML = '<span class="text-blue-400">🔄 Updating gift catalog from stream...</span>';

    try {
        const response = await fetch('/api/gift-catalog/update', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            infoDiv.innerHTML = `<span class="text-green-400">✅ ${result.message || 'Catalog updated successfully'}</span>`;
            // Katalog neu laden
            await loadGiftCatalog();
        } else {
            infoDiv.innerHTML = `<span class="text-red-400">❌ ${result.error || 'Failed to update catalog'}</span>`;
        }
    } catch (error) {
        console.error('Error refreshing gift catalog:', error);
        infoDiv.innerHTML = '<span class="text-red-400">❌ Error updating catalog. Make sure you are connected to a stream.</span>';
    } finally {
        btn.disabled = false;
        icon.style.animation = '';
    }
}

function selectGift(gift) {
    // Formular mit Gift-Daten füllen
    document.getElementById('new-gift-id').value = gift.id;
    document.getElementById('new-gift-label').value = gift.name;

    // Wenn bereits ein Sound konfiguriert ist, diese Daten laden
    loadExistingGiftSound(gift.id);

    // Scroll zum Formular
    document.getElementById('new-gift-url').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('new-gift-url').focus();
}

async function loadExistingGiftSound(giftId) {
    try {
        const response = await fetch('/api/soundboard/gifts');
        const gifts = await response.json();

        const existingGift = gifts.find(g => g.giftId === giftId);
        if (existingGift) {
            document.getElementById('new-gift-url').value = existingGift.mp3Url || '';
            document.getElementById('new-gift-volume').value = existingGift.volume || 1.0;
            document.getElementById('new-gift-animation-url').value = existingGift.animationUrl || '';
            document.getElementById('new-gift-animation-type').value = existingGift.animationType || 'none';
        }
    } catch (error) {
        console.error('Error loading existing gift sound:', error);
    }
}

function clearGiftSoundForm() {
    document.getElementById('new-gift-id').value = '';
    document.getElementById('new-gift-label').value = '';
    document.getElementById('new-gift-url').value = '';
    document.getElementById('new-gift-volume').value = '1.0';
    document.getElementById('new-gift-animation-url').value = '';
    document.getElementById('new-gift-animation-type').value = 'none';
}

// ========== TTS SETTINGS ==========
async function loadTTSSettings() {
    try {
        const response = await fetch('/api/settings');
        settings = await response.json();

        // TTS Provider
        const providerSelect = document.getElementById('tts-provider');
        if (providerSelect) {
            providerSelect.value = settings.tts_provider || 'tiktok';
            onTTSProviderChange(); // Update UI basierend auf Provider
        }

        // Google API Key
        const apiKeyInput = document.getElementById('google-api-key');
        if (apiKeyInput) {
            apiKeyInput.value = settings.google_tts_api_key || '';
        }

        // Load TTS Core V2 Config
        const ttsResponse = await fetch('/api/tts-v2/config');
        const ttsData = await ttsResponse.json();
        const ttsConfig = ttsData.config || {};

        // General Settings
        const defaultVoice = document.getElementById('default-voice');
        if (defaultVoice) {
            defaultVoice.value = ttsConfig.default_voice || 'en_us_001';
        }

        const ttsVolume = document.getElementById('tts-volume');
        if (ttsVolume) {
            ttsVolume.value = ttsConfig.volume || 80;
            document.getElementById('tts-volume-label').textContent = ttsConfig.volume || 80;
        }

        const ttsSpeed = document.getElementById('tts-speed');
        if (ttsSpeed) {
            ttsSpeed.value = ttsConfig.speed || 1.0;
            document.getElementById('tts-speed-label').textContent = ttsConfig.speed || 1.0;
        }

        const ttsMinTeamLevel = document.getElementById('tts-min-team-level');
        if (ttsMinTeamLevel) {
            ttsMinTeamLevel.value = ttsConfig.min_team_level || 0;
        }

        // Voices laden
        await loadVoices();

    } catch (error) {
        console.error('Error loading TTS settings:', error);
    }
}

async function saveTTSSettings() {
    const provider = document.getElementById('tts-provider').value;
    const googleApiKey = document.getElementById('google-api-key').value;
    const defaultVoice = document.getElementById('default-voice').value;
    const ttsVolume = document.getElementById('tts-volume').value;
    const ttsSpeed = document.getElementById('tts-speed').value;
    const ttsChatEnabled = document.getElementById('tts-chat-enabled').checked;
    const ttsMinTeamLevel = document.getElementById('tts-min-team-level').value;

    // Validierung: Google API Key erforderlich wenn Google ausgewählt
    if (provider === 'google' && !googleApiKey) {
        alert('❌ Please enter your Google Cloud TTS API key!');
        return;
    }

    // TTS Core V2 Config (uses /api/tts-v2/config)
    const ttsConfig = {
        default_voice: defaultVoice,
        volume: parseInt(ttsVolume),
        speed: parseFloat(ttsSpeed),
        min_team_level: parseInt(ttsMinTeamLevel)
    };

    try {
        const response = await fetch('/api/tts-v2/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ttsConfig)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ TTS Settings saved!');
            settings = { ...settings, ...newSettings };
        }
    } catch (error) {
        console.error('Error saving TTS settings:', error);
        alert('❌ Error saving TTS settings!');
    }
}

function onTTSProviderChange() {
    const provider = document.getElementById('tts-provider').value;
    const googleApiKeyContainer = document.getElementById('google-api-key-container');

    // Google API Key Container ein/ausblenden
    if (provider === 'google') {
        googleApiKeyContainer.classList.remove('hidden');
    } else {
        googleApiKeyContainer.classList.add('hidden');
    }

    // Voices neu laden für den gewählten Provider
    loadVoices(provider);
}

async function testTTS() {
    const testText = document.getElementById('tts-test-text').value;

    if (!testText || testText.trim().length === 0) {
        alert('⚠️ Please enter some text to test!');
        return;
    }

    try {
        const response = await fetch('/api/tts-v2/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: testText,
                voice: document.getElementById('default-voice').value
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ TTS test sent! Listen in your overlay.');
        } else {
            alert('❌ TTS test failed: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error testing TTS:', error);
        alert('❌ Error testing TTS!');
    }
}

// ========== USER PROFILE MANAGEMENT ==========

// Lädt das aktive Profil und zeigt es an
async function loadActiveProfile() {
    try {
        const response = await fetch('/api/profiles/active');
        const data = await response.json();

        if (data.activeProfile) {
            document.getElementById('current-profile-name').textContent = data.activeProfile;
            document.getElementById('active-profile-display').textContent = data.activeProfile;
        }
    } catch (error) {
        console.error('Error loading active profile:', error);
    }
}

// Lädt alle verfügbaren Profile
async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        const profileList = document.getElementById('profile-list');
        profileList.innerHTML = '';

        if (data.profiles.length === 0) {
            profileList.innerHTML = '<div class="text-gray-400 text-center py-4">Keine Profile gefunden</div>';
            return;
        }

        data.profiles.forEach(profile => {
            const profileCard = document.createElement('div');
            profileCard.className = `bg-gray-700 rounded-lg p-4 flex items-center justify-between ${
                profile.isActive ? 'border-2 border-blue-500' : ''
            }`;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'flex-1';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'font-semibold flex items-center gap-2';
            nameDiv.innerHTML = `
                <span>${profile.username}</span>
                ${profile.isActive ? '<span class="text-xs bg-blue-600 px-2 py-1 rounded">AKTIV</span>' : ''}
            `;

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'text-xs text-gray-400 mt-1';
            const modifiedDate = new Date(profile.modified).toLocaleString('de-DE');
            const sizeKB = (profile.size / 1024).toFixed(2);
            detailsDiv.textContent = `Zuletzt geändert: ${modifiedDate} | Größe: ${sizeKB} KB`;

            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(detailsDiv);

            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'flex gap-2';

            // Switch Button (nur wenn nicht aktiv)
            if (!profile.isActive) {
                const switchBtn = document.createElement('button');
                switchBtn.className = 'bg-blue-600 px-3 py-1 rounded hover:bg-blue-700 text-sm';
                switchBtn.textContent = '🔄 Wechseln';
                switchBtn.onclick = () => switchProfile(profile.username);
                buttonsDiv.appendChild(switchBtn);
            }

            // Backup Button
            const backupBtn = document.createElement('button');
            backupBtn.className = 'bg-gray-600 px-3 py-1 rounded hover:bg-gray-500 text-sm';
            backupBtn.textContent = '💾';
            backupBtn.title = 'Backup erstellen';
            backupBtn.onclick = () => backupProfile(profile.username);
            buttonsDiv.appendChild(backupBtn);

            // Delete Button (nicht für aktives Profil)
            if (!profile.isActive) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'bg-red-600 px-3 py-1 rounded hover:bg-red-700 text-sm';
                deleteBtn.textContent = '🗑️';
                deleteBtn.title = 'Profil löschen';
                deleteBtn.onclick = () => deleteProfile(profile.username);
                buttonsDiv.appendChild(deleteBtn);
            }

            profileCard.appendChild(infoDiv);
            profileCard.appendChild(buttonsDiv);
            profileList.appendChild(profileCard);
        });
    } catch (error) {
        console.error('Error loading profiles:', error);
    }
}

// Zeigt das Profile Modal
async function showProfileModal() {
    document.getElementById('profile-modal').classList.add('active');
    await loadProfiles();
}

// Versteckt das Profile Modal
function hideProfileModal() {
    document.getElementById('profile-modal').classList.remove('active');
}

// Erstellt ein neues Profil
async function createProfile() {
    const usernameInput = document.getElementById('new-profile-username');
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Bitte gib einen Profilnamen ein!');
        return;
    }

    try {
        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Profil "${username}" wurde erfolgreich erstellt!`);
            usernameInput.value = '';
            await loadProfiles();
        } else {
            alert('❌ Fehler beim Erstellen des Profils: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating profile:', error);
        alert('❌ Fehler beim Erstellen des Profils!');
    }
}

// Wechselt zu einem anderen Profil
async function switchProfile(username) {
    const confirmSwitch = confirm(
        `Möchtest du zu Profil "${username}" wechseln?\n\n` +
        `⚠️ Die Anwendung muss danach neu gestartet werden!`
    );

    if (!confirmSwitch) return;

    try {
        const response = await fetch('/api/profiles/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        const result = await response.json();

        if (result.success) {
            alert(
                `✅ Profil gewechselt zu "${username}"!\n\n` +
                `Bitte starte die Anwendung neu, um das neue Profil zu verwenden.`
            );
            hideProfileModal();
        } else {
            alert('❌ Fehler beim Wechseln des Profils: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error switching profile:', error);
        alert('❌ Fehler beim Wechseln des Profils!');
    }
}

// Löscht ein Profil
async function deleteProfile(username) {
    const confirmDelete = confirm(
        `Möchtest du das Profil "${username}" wirklich löschen?\n\n` +
        `⚠️ Diese Aktion kann nicht rückgängig gemacht werden!\n` +
        `Alle Einstellungen, Voice-Mappings, Sounds und Konfigurationen werden gelöscht.`
    );

    if (!confirmDelete) return;

    try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Profil "${username}" wurde gelöscht!`);
            await loadProfiles();
        } else {
            alert('❌ Fehler beim Löschen des Profils: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting profile:', error);
        alert('❌ Fehler beim Löschen des Profils!');
    }
}

// Erstellt ein Backup eines Profils
async function backupProfile(username) {
    try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(username)}/backup`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            alert(
                `✅ Backup erstellt!\n\n` +
                `Profil: ${username}\n` +
                `Backup-Datei: ${result.backup.backupPath}`
            );
        } else {
            alert('❌ Fehler beim Erstellen des Backups: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        alert('❌ Fehler beim Erstellen des Backups!');
    }
}

// ========== AUDIO INFO BANNER ==========
function initializeAudioInfoBanner() {
    const banner = document.querySelector('.bg-yellow-600');
    const dismissBtn = document.getElementById('dismiss-audio-info');

    if (!banner || !dismissBtn) return;

    // Prüfe ob Banner bereits dismissed wurde
    const isDismissed = localStorage.getItem('audio-info-dismissed');
    if (isDismissed === 'true') {
        banner.style.display = 'none';
    }

    // Dismiss-Button Event
    dismissBtn.addEventListener('click', () => {
        banner.style.display = 'none';
        localStorage.setItem('audio-info-dismissed', 'true');
    });
}

// ========== PLUGIN-BASED UI VISIBILITY ==========
// This functionality is now handled by navigation.js
// See NavigationManager.initializePluginVisibility()

// ========== DASHBOARD AUDIO PLAYBACK ==========

/**
 * TTS im Dashboard abspielen
 */
function playDashboardTTS(data) {
    console.log('🎤 [Dashboard] Playing TTS:', data.text);

    const audio = document.getElementById('dashboard-tts-audio');

    try {
        // Base64-Audio zu Blob konvertieren
        const audioData = data.audioData;
        const audioBlob = base64ToBlob(audioData, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);

        audio.src = audioUrl;
        audio.volume = (data.volume || 80) / 100;
        audio.playbackRate = data.speed || 1.0;

        audio.play().then(() => {
            console.log('✅ [Dashboard] TTS started playing');
        }).catch(err => {
            console.error('❌ [Dashboard] TTS playback error:', err);
        });

        // URL nach Abspielen freigeben
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            console.log('✅ [Dashboard] TTS finished');
        };

        audio.onerror = (err) => {
            console.error('❌ [Dashboard] TTS audio error:', err);
            URL.revokeObjectURL(audioUrl);
        };

    } catch (error) {
        console.error('❌ [Dashboard] Error in playDashboardTTS:', error);
    }
}

/**
 * Soundboard-Audio im Dashboard abspielen
 */
function playDashboardSoundboard(data) {
    console.log('🔊 [Dashboard] Playing soundboard:', data.label);

    // Create new audio element
    const audio = document.createElement('audio');
    audio.src = data.url;
    audio.volume = data.volume || 1.0;

    // Add to pool
    const pool = document.getElementById('dashboard-soundboard-pool');
    pool.appendChild(audio);

    // Play
    audio.play().then(() => {
        console.log('✅ [Dashboard] Soundboard started playing:', data.label);
    }).catch(err => {
        console.error('❌ [Dashboard] Soundboard playback error:', err);
    });

    // Remove after playback
    audio.onended = () => {
        console.log('✅ [Dashboard] Soundboard finished:', data.label);
        audio.remove();
    };

    audio.onerror = (e) => {
        console.error('❌ [Dashboard] Error playing soundboard:', data.label, e);
        audio.remove();
    };
}

/**
 * Base64 zu Blob konvertieren (für TTS)
 */
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// ========== AUTO-START FUNCTIONALITY ==========

/**
 * Load auto-start status and platform info
 */
async function loadAutoStartSettings() {
    try {
        // Load platform info
        const platformResponse = await fetch('/api/autostart/platform');
        const platformData = await platformResponse.json();

        if (platformData.success) {
            document.getElementById('autostart-platform-name').textContent = platformData.name || 'Unknown';
            document.getElementById('autostart-platform-method').textContent = platformData.method || 'Unknown';
            document.getElementById('autostart-supported').textContent = platformData.supported ? '✅ Yes' : '❌ No';
        }

        // Load status
        const statusResponse = await fetch('/api/autostart/status');
        const statusData = await statusResponse.json();

        if (statusData.success) {
            const checkbox = document.getElementById('autostart-enabled');
            checkbox.checked = statusData.enabled;

            const statusText = statusData.enabled ? '✅ Enabled' : '❌ Disabled';
            document.getElementById('autostart-status').textContent = statusText;
            document.getElementById('autostart-status').className = statusData.enabled ? 'font-semibold text-green-400' : 'font-semibold text-gray-400';
        }
    } catch (error) {
        console.error('Failed to load auto-start settings:', error);
        document.getElementById('autostart-status').textContent = '❌ Error';
        document.getElementById('autostart-status').className = 'font-semibold text-red-400';
    }
}

/**
 * Toggle auto-start
 */
async function toggleAutoStart(enabled) {
    try {
        const response = await fetch('/api/autostart/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, hidden: false })
        });

        const data = await response.json();

        if (data.success) {
            const statusText = enabled ? '✅ Enabled' : '❌ Disabled';
            document.getElementById('autostart-status').textContent = statusText;
            document.getElementById('autostart-status').className = enabled ? 'font-semibold text-green-400' : 'font-semibold text-gray-400';

            // Show success message
            showNotification(
                enabled ? 'Auto-start enabled' : 'Auto-start disabled',
                enabled ? 'Application will start automatically on boot' : 'Auto-start disabled',
                'success'
            );
        } else {
            // Revert checkbox
            document.getElementById('autostart-enabled').checked = !enabled;
            showNotification('Error', data.error || 'Failed to toggle auto-start', 'error');
        }
    } catch (error) {
        console.error('Failed to toggle auto-start:', error);
        // Revert checkbox
        document.getElementById('autostart-enabled').checked = !enabled;
        showNotification('Error', 'Failed to toggle auto-start: ' + error.message, 'error');
    }
}

// REMOVED: Duplicate DOMContentLoaded listener consolidated into main initialization above
// NOTE: Settings loading is now handled by navigation.js when view switches to 'settings'
// Event listeners moved to initializeButtons() function for proper consolidation

// ========== PRESET IMPORT/EXPORT FUNCTIONALITY ==========

/**
 * Export configuration preset
 */
async function exportPreset() {
    try {
        const name = document.getElementById('preset-name').value || 'My Preset';
        const description = document.getElementById('preset-description').value || '';

        const options = {
            name,
            description,
            includeSettings: document.getElementById('export-settings').checked,
            includeFlows: document.getElementById('export-flows').checked,
            includeAlerts: document.getElementById('export-alerts').checked,
            includeGiftSounds: document.getElementById('export-gift-sounds').checked,
            includeVoiceMappings: document.getElementById('export-voice-mappings').checked,
            includePluginConfigs: document.getElementById('export-plugin-configs').checked,
        };

        showNotification('Exporting...', 'Creating preset file...', 'info');

        const response = await fetch('/api/presets/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        const data = await response.json();

        if (data.success) {
            // Download as JSON file
            const blob = new Blob([JSON.stringify(data.preset, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showNotification('Success', 'Preset exported successfully!', 'success');

            // Clear form
            document.getElementById('preset-name').value = '';
            document.getElementById('preset-description').value = '';
        } else {
            showNotification('Error', data.error || 'Failed to export preset', 'error');
        }
    } catch (error) {
        console.error('Failed to export preset:', error);
        showNotification('Error', 'Failed to export preset: ' + error.message, 'error');
    }
}

/**
 * Import configuration preset
 */
async function importPreset() {
    try {
        const fileInput = document.getElementById('preset-file-input');
        const file = fileInput.files[0];

        if (!file) {
            showNotification('Error', 'Please select a preset file', 'error');
            return;
        }

        showNotification('Importing...', 'Loading preset file...', 'info');

        // Read file
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const preset = JSON.parse(e.target.result);

                const options = {
                    overwrite: document.getElementById('import-overwrite').checked,
                    createBackup: document.getElementById('import-backup').checked,
                };

                const response = await fetch('/api/presets/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preset, options })
                });

                const data = await response.json();

                if (data.success) {
                    let message = 'Preset imported successfully!\n\n';
                    message += 'Imported: ' + Object.keys(data.imported).join(', ');

                    if (Object.keys(data.errors).length > 0) {
                        message += '\n\nErrors: ' + Object.keys(data.errors).join(', ');
                    }

                    showNotification('Success', message, 'success');

                    // Clear file input
                    fileInput.value = '';

                    // Suggest reload
                    if (confirm('Preset imported! Would you like to reload the page to see changes?')) {
                        location.reload();
                    }
                } else {
                    showNotification('Error', data.error || 'Failed to import preset', 'error');
                }
            } catch (parseError) {
                console.error('Failed to parse preset file:', parseError);
                showNotification('Error', 'Invalid preset file format', 'error');
            }
        };

        reader.onerror = () => {
            showNotification('Error', 'Failed to read file', 'error');
        };

        reader.readAsText(file);
    } catch (error) {
        console.error('Failed to import preset:', error);
        showNotification('Error', 'Failed to import preset: ' + error.message, 'error');
    }
}

/**
 * Show notification (using browser alert for now, can be replaced with better UI)
 */
function showNotification(title, message, type) {
    // Simple alert for now - can be replaced with a toast notification system
    if (type === 'error') {
        alert(`❌ ${title}\n\n${message}`);
    } else if (type === 'success') {
        alert(`✅ ${title}\n\n${message}`);
    } else {
        alert(`ℹ️ ${title}\n\n${message}`);
    }
}

// ========== RESOURCE MONITOR SETTINGS ==========

/**
 * Load resource monitor settings
 */
async function loadResourceMonitorSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Load settings into UI
        document.getElementById('resource-monitor-enabled').checked = settings.resource_monitor_enabled === 'true';
        document.getElementById('resource-monitor-interval').value = settings.resource_monitor_interval || '1000';
        document.getElementById('resource-monitor-show-cpu').checked = settings.resource_monitor_show_cpu !== 'false';
        document.getElementById('resource-monitor-show-ram').checked = settings.resource_monitor_show_ram !== 'false';
        document.getElementById('resource-monitor-show-gpu').checked = settings.resource_monitor_show_gpu !== 'false';
        document.getElementById('cpu-warning-yellow').value = settings.cpu_warning_yellow || '5';
        document.getElementById('cpu-warning-red').value = settings.cpu_warning_red || '8';
        document.getElementById('ram-warning-threshold').value = settings.ram_warning_threshold || '90';
        document.getElementById('resource-monitor-history-length').value = settings.resource_monitor_history_length || '60';
        document.getElementById('resource-monitor-notifications').checked = settings.resource_monitor_notifications !== 'false';

        // Update interval label
        const intervalValue = parseInt(settings.resource_monitor_interval || '1000');
        document.getElementById('resource-monitor-interval-label').textContent = (intervalValue / 1000).toFixed(1) + 's';

    } catch (error) {
        console.error('Error loading resource monitor settings:', error);
    }
}

/**
 * Save resource monitor settings
 */
async function saveResourceMonitorSettings() {
    const newSettings = {
        resource_monitor_enabled: document.getElementById('resource-monitor-enabled').checked ? 'true' : 'false',
        resource_monitor_interval: document.getElementById('resource-monitor-interval').value,
        resource_monitor_show_cpu: document.getElementById('resource-monitor-show-cpu').checked ? 'true' : 'false',
        resource_monitor_show_ram: document.getElementById('resource-monitor-show-ram').checked ? 'true' : 'false',
        resource_monitor_show_gpu: document.getElementById('resource-monitor-show-gpu').checked ? 'true' : 'false',
        cpu_warning_yellow: document.getElementById('cpu-warning-yellow').value,
        cpu_warning_red: document.getElementById('cpu-warning-red').value,
        ram_warning_threshold: document.getElementById('ram-warning-threshold').value,
        resource_monitor_history_length: document.getElementById('resource-monitor-history-length').value,
        resource_monitor_notifications: document.getElementById('resource-monitor-notifications').checked ? 'true' : 'false'
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });

        const result = await response.json();
        if (result.success) {
            alert('✅ Resource Monitor settings saved successfully!');
        } else {
            alert('❌ Error saving settings: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving resource monitor settings:', error);
        alert('❌ Error saving Resource Monitor settings!');
    }
}

// ========== OSC-BRIDGE SETTINGS ==========
async function loadOSCBridgeSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Load OSC-Bridge enabled setting
        const oscBridgeEnabled = document.getElementById('osc-bridge-enabled');
        if (oscBridgeEnabled) {
            oscBridgeEnabled.checked = settings.osc_bridge_enabled === 'true';
        }

    } catch (error) {
        console.error('Error loading OSC-Bridge settings:', error);
    }
}

// Initialize OSC-Bridge settings checkbox handler
document.addEventListener('DOMContentLoaded', () => {
    const oscBridgeCheckbox = document.getElementById('osc-bridge-enabled');
    if (oscBridgeCheckbox) {
        oscBridgeCheckbox.addEventListener('change', async (e) => {
            const enabled = e.target.checked;

            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ osc_bridge_enabled: enabled ? 'true' : 'false' })
                });

                const result = await response.json();
                if (result.success) {
                    console.log(`OSC-Bridge ${enabled ? 'enabled' : 'disabled'}`);
                    // Update the quick action button state if it exists
                    const quickBtn = document.getElementById('quick-osc-bridge-btn');
                    if (quickBtn) {
                        quickBtn.setAttribute('data-state', enabled ? 'on' : 'off');
                    }
                } else {
                    // Revert on error
                    oscBridgeCheckbox.checked = !enabled;
                    alert('Error saving OSC-Bridge setting');
                }
            } catch (error) {
                console.error('Error saving OSC-Bridge setting:', error);
                oscBridgeCheckbox.checked = !enabled;
            }
        });
    }
});
