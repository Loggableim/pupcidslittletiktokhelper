// TTS Admin Panel JavaScript - Production Version
// CSP-compliant, no inline handlers, robust error handling

// ============================================================================
// GLOBAL STATE
// ============================================================================
let socket = null;
let currentConfig = {};
let currentUsers = [];
let currentFilter = 'all';
let voices = {};
let queuePollInterval = null;
let statsPollInterval = null;

// ============================================================================
// SOCKET.IO INITIALIZATION
// ============================================================================
function initializeSocket() {
    try {
        if (typeof io !== 'undefined') {
            socket = io();
            console.log('✓ Socket.io connected');

            // Setup socket event listeners
            socket.on('tts:queue_update', () => {
                loadQueue().catch(err => console.error('Queue update failed:', err));
            });

            socket.on('tts:config_update', () => {
                loadConfig().catch(err => console.error('Config update failed:', err));
            });
        } else {
            console.warn('⚠ Socket.io not available - using polling only');
        }
    } catch (error) {
        console.error('Socket.io initialization error:', error);
    }
}

// ============================================================================
// FETCH HELPERS WITH VALIDATION
// ============================================================================

/**
 * Validates and parses JSON response with comprehensive error handling
 */
async function fetchJSON(url, options = {}) {
    try {
        const response = await fetch(url, options);

        // Check HTTP status
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Validate Content-Type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Expected JSON but got:', contentType, '\nResponse:', text.substring(0, 200));
            throw new Error(`Expected JSON but received ${contentType || 'unknown type'}`);
        }

        // Parse JSON with error handling
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            throw new Error(`JSON parse failed: ${parseError.message}`);
        }

        return data;

    } catch (error) {
        console.error(`Fetch failed for ${url}:`, error);
        throw error;
    }
}

/**
 * POST request helper with JSON validation
 */
async function postJSON(url, body) {
    return fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 TTS Admin Panel initializing...');

    const statusEl = document.getElementById('init-status');
    const debugInfo = document.getElementById('debug-info');

    try {
        // Initialize Socket.io
        initializeSocket();

        // Load configuration
        if (statusEl) statusEl.textContent = 'Loading configuration...';
        await loadConfig();
        console.log('✓ Config loaded');

        // Load voices
        if (statusEl) statusEl.textContent = 'Loading voices...';
        await loadVoices();
        console.log('✓ Voices loaded');

        // Load users (non-critical)
        if (statusEl) statusEl.textContent = 'Loading users...';
        try {
            await loadUsers();
            console.log('✓ Users loaded');
        } catch (error) {
            console.error('✗ Users load failed:', error);
            showNotification('Failed to load users (non-critical)', 'warning');
        }

        // Load statistics (non-critical)
        if (statusEl) statusEl.textContent = 'Loading statistics...';
        try {
            await loadStats();
            console.log('✓ Stats loaded');
        } catch (error) {
            console.error('✗ Stats load failed:', error);
            showNotification('Failed to load statistics (non-critical)', 'warning');
        }

        // Setup event listeners
        setupEventListeners();

        // Start polling
        startQueuePolling();
        startStatsPolling();

        // Success!
        console.log('✓ TTS Admin Panel initialized successfully');
        if (statusEl) statusEl.innerHTML = '<span class="text-green-500">✓ Initialized successfully</span>';
        if (debugInfo) debugInfo.style.display = 'none';

    } catch (error) {
        console.error('✗ Initialization failed:', error);
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-red-500">✗ Init failed: ${error.message}</span>`;
        }
        showNotification(`Initialization failed: ${error.message}`, 'error');
    }
});

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });

    // Reset all tab buttons
    document.querySelectorAll('.tab-button').forEach(el => {
        el.classList.remove('border-blue-500', 'text-blue-400');
        el.classList.add('border-transparent', 'text-gray-400');
    });

    // Show selected tab
    const contentEl = document.getElementById(`content-${tabName}`);
    if (contentEl) {
        contentEl.classList.remove('hidden');
    }

    // Highlight selected button
    const buttonEl = document.getElementById(`tab-${tabName}`);
    if (buttonEl) {
        buttonEl.classList.remove('border-transparent', 'text-gray-400');
        buttonEl.classList.add('border-blue-500', 'text-blue-400');
    }
}

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

async function loadConfig() {
    try {
        const data = await fetchJSON('/api/tts/config');

        if (!data.success) {
            throw new Error(data.error || 'Unknown error loading config');
        }

        currentConfig = data.config;
        populateConfig(currentConfig);

    } catch (error) {
        console.error('Failed to load config:', error);
        showNotification(`Failed to load configuration: ${error.message}`, 'error');
        throw error; // Re-throw for initialization to catch
    }
}

function populateConfig(config) {
    // Helper to safely set element value
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = value;
            } else {
                el.value = value;
            }
        }
    };

    // Helper to safely set text content
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // Populate all fields
    setValue('defaultEngine', config.defaultEngine || 'tiktok');
    setValue('volume', config.volume || 80);
    setText('volumeValue', config.volume || 80);
    setValue('speed', config.speed || 1.0);
    setText('speedValue', config.speed || 1.0);
    setValue('teamMinLevel', config.teamMinLevel || 0);
    setValue('rateLimit', config.rateLimit || 3);
    setValue('rateLimitWindow', config.rateLimitWindow || 60);
    setValue('maxQueueSize', config.maxQueueSize || 100);
    setValue('maxTextLength', config.maxTextLength || 300);
    setValue('profanityFilter', config.profanityFilter || 'moderate');
    setValue('duckOtherAudio', config.duckOtherAudio || false);
    setValue('duckVolume', (config.duckVolume || 0.3) * 100);
    setText('duckVolumeValue', Math.round((config.duckVolume || 0.3) * 100));
    setValue('enabledForChat', config.enabledForChat !== false);
    setValue('autoLanguageDetection', config.autoLanguageDetection !== false);

    // Handle API key - show placeholder if hidden
    const apiKeyInput = document.getElementById('googleApiKey');
    if (apiKeyInput) {
        if (config.googleApiKey) {
            if (config.googleApiKey === '***HIDDEN***') {
                apiKeyInput.placeholder = 'API key configured (hidden for security)';
                apiKeyInput.value = '';
            } else {
                apiKeyInput.value = config.googleApiKey;
            }
        } else {
            apiKeyInput.placeholder = 'Enter API key...';
            apiKeyInput.value = '';
        }
    }
}

async function saveConfig() {
    try {
        // Gather all config values
        const config = {
            defaultEngine: document.getElementById('defaultEngine').value,
            defaultVoice: document.getElementById('defaultVoice').value,
            volume: parseInt(document.getElementById('volume').value, 10),
            speed: parseFloat(document.getElementById('speed').value),
            teamMinLevel: parseInt(document.getElementById('teamMinLevel').value, 10),
            rateLimit: parseInt(document.getElementById('rateLimit').value, 10),
            rateLimitWindow: parseInt(document.getElementById('rateLimitWindow').value, 10),
            maxQueueSize: parseInt(document.getElementById('maxQueueSize').value, 10),
            maxTextLength: parseInt(document.getElementById('maxTextLength').value, 10),
            profanityFilter: document.getElementById('profanityFilter').value,
            duckOtherAudio: document.getElementById('duckOtherAudio').checked,
            duckVolume: parseInt(document.getElementById('duckVolume').value, 10) / 100,
            enabledForChat: document.getElementById('enabledForChat').checked,
            autoLanguageDetection: document.getElementById('autoLanguageDetection').checked
        };

        // Add API key if provided
        const apiKey = document.getElementById('googleApiKey').value;
        if (apiKey && apiKey !== '***HIDDEN***') {
            config.googleApiKey = apiKey;
        }

        // Save to server
        const data = await postJSON('/api/tts/config', config);

        if (!data.success) {
            throw new Error(data.error || 'Failed to save configuration');
        }

        currentConfig = data.config;
        showNotification('Configuration saved successfully', 'success');

    } catch (error) {
        console.error('Failed to save config:', error);
        showNotification(`Failed to save configuration: ${error.message}`, 'error');
    }
}

// ============================================================================
// VOICE MANAGEMENT
// ============================================================================

async function loadVoices() {
    try {
        const data = await fetchJSON('/api/tts/voices?engine=all');

        if (!data.success) {
            throw new Error(data.error || 'Failed to load voices');
        }

        voices = data.voices;
        populateVoiceSelect();

    } catch (error) {
        console.error('Failed to load voices:', error);
        showNotification(`Failed to load voices: ${error.message}`, 'error');
        throw error;
    }
}

function populateVoiceSelect() {
    const select = document.getElementById('defaultVoice');
    if (!select) return;

    select.innerHTML = '';

    const engine = document.getElementById('defaultEngine')?.value || 'tiktok';
    const engineVoices = voices[engine];

    if (!engineVoices) {
        select.innerHTML = '<option value="">No voices available</option>';
        return;
    }

    const optgroup = document.createElement('optgroup');
    optgroup.label = engine === 'tiktok' ? 'TikTok TTS' : 'Google Cloud TTS';

    Object.entries(engineVoices).forEach(([id, voice]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = voice.name || id;
        optgroup.appendChild(option);
    });

    select.appendChild(optgroup);

    // Set current default voice
    if (currentConfig.defaultVoice) {
        select.value = currentConfig.defaultVoice;
    }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function loadUsers(filter = null) {
    try {
        const filterParam = filter && filter !== 'all' ? `?filter=${filter}` : '';
        const data = await fetchJSON(`/api/tts/users${filterParam}`);

        if (!data.success) {
            throw new Error(data.error || 'Failed to load users');
        }

        currentUsers = data.users || [];
        renderUsers();

    } catch (error) {
        console.error('Failed to load users:', error);
        showNotification(`Failed to load users: ${error.message}`, 'error');
        throw error;
    }
}

function filterUsers(filter) {
    currentFilter = filter;

    // Update filter button styles
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.classList.add('bg-blue-600');
            btn.classList.remove('bg-gray-700');
        } else {
            btn.classList.remove('bg-blue-600');
            btn.classList.add('bg-gray-700');
        }
    });

    loadUsers(filter === 'all' ? null : filter).catch(err => {
        console.error('Filter failed:', err);
    });
}

function renderUsers() {
    const list = document.getElementById('userList');
    if (!list) return;

    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';

    const filtered = currentUsers.filter(user =>
        user.username.toLowerCase().includes(searchTerm) ||
        user.user_id.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">No users found</div>';
        return;
    }

    list.innerHTML = filtered.map(user => {
        const allowButton = !user.allow_tts
            ? `<button class="user-action-btn bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm" data-action="allow" data-user-id="${user.user_id}" data-username="${user.username}">Allow</button>`
            : `<button class="user-action-btn bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm" data-action="deny" data-user-id="${user.user_id}" data-username="${user.username}">Revoke</button>`;

        const blacklistButton = !user.is_blacklisted
            ? `<button class="user-action-btn bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm" data-action="blacklist" data-user-id="${user.user_id}" data-username="${user.username}">Blacklist</button>`
            : `<button class="user-action-btn bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm" data-action="unblacklist" data-user-id="${user.user_id}" data-username="${user.username}">Unblacklist</button>`;

        return `
            <div class="bg-gray-700 rounded p-4 flex justify-between items-center fade-in">
                <div class="flex-1">
                    <div class="font-bold">${escapeHtml(user.username)}</div>
                    <div class="text-sm text-gray-400">
                        ${user.assigned_voice_id ? `Voice: ${escapeHtml(user.assigned_voice_id)}` : 'No voice assigned'}
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${user.allow_tts ? '<span class="text-green-400">✓ Allowed</span>' : ''}
                        ${user.is_blacklisted ? '<span class="text-red-400">⛔ Blacklisted</span>' : ''}
                    </div>
                </div>
                <div class="flex space-x-2">
                    ${allowButton}
                    ${blacklistButton}
                    <button class="user-action-btn bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm" data-action="assign-voice" data-user-id="${user.user_id}" data-username="${user.username}">
                        ${user.assigned_voice_id ? 'Change' : 'Assign'} Voice
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners to user action buttons
    list.querySelectorAll('.user-action-btn').forEach(btn => {
        btn.addEventListener('click', handleUserAction);
    });
}

async function handleUserAction(event) {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    const userId = btn.dataset.userId;
    const username = btn.dataset.username;

    try {
        switch (action) {
            case 'allow':
                await allowUser(userId, username);
                break;
            case 'deny':
                await denyUser(userId, username);
                break;
            case 'blacklist':
                await blacklistUser(userId, username);
                break;
            case 'unblacklist':
                await unblacklistUser(userId);
                break;
            case 'assign-voice':
                await assignVoiceDialog(userId, username);
                break;
        }
    } catch (error) {
        console.error('User action failed:', error);
    }
}

async function allowUser(userId, username) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/allow`, { username });

        if (!data.success) {
            throw new Error(data.error || 'Failed to allow user');
        }

        showNotification(`TTS allowed for ${username}`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to allow user:', error);
        showNotification(`Failed to allow user: ${error.message}`, 'error');
    }
}

async function denyUser(userId, username) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/deny`, { username });

        if (!data.success) {
            throw new Error(data.error || 'Failed to deny user');
        }

        showNotification(`TTS revoked for ${username}`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to deny user:', error);
        showNotification(`Failed to deny user: ${error.message}`, 'error');
    }
}

async function blacklistUser(userId, username) {
    if (!confirm(`Are you sure you want to blacklist ${username}?`)) return;

    try {
        const data = await postJSON(`/api/tts/users/${userId}/blacklist`, { username });

        if (!data.success) {
            throw new Error(data.error || 'Failed to blacklist user');
        }

        showNotification(`${username} has been blacklisted`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to blacklist user:', error);
        showNotification(`Failed to blacklist user: ${error.message}`, 'error');
    }
}

async function unblacklistUser(userId) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/unblacklist`, {});

        if (!data.success) {
            throw new Error(data.error || 'Failed to unblacklist user');
        }

        showNotification('User removed from blacklist', 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to unblacklist user:', error);
        showNotification(`Failed to unblacklist user: ${error.message}`, 'error');
    }
}

async function assignVoiceDialog(userId, username) {
    const engine = prompt('Select engine:\n1. tiktok\n2. google', 'tiktok');
    if (!engine) return;

    const voiceList = voices[engine];
    if (!voiceList) {
        alert('Engine not available');
        return;
    }

    const voiceOptions = Object.keys(voiceList)
        .slice(0, 20) // Show first 20
        .map((id, i) => `${i + 1}. ${id} - ${voiceList[id].name}`)
        .join('\n');

    const voiceId = prompt(`Select voice:\n${voiceOptions}\n\nEnter voice ID:`, '');
    if (!voiceId) return;

    await assignVoice(userId, username, voiceId, engine);
}

async function assignVoice(userId, username, voiceId, engine) {
    try {
        const data = await postJSON(`/api/tts/users/${userId}/voice`, {
            username,
            voiceId,
            engine
        });

        if (!data.success) {
            throw new Error(data.error || 'Failed to assign voice');
        }

        showNotification(`Voice assigned to ${username}`, 'success');
        await loadUsers(currentFilter);

    } catch (error) {
        console.error('Failed to assign voice:', error);
        showNotification(`Failed to assign voice: ${error.message}`, 'error');
    }
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

function startQueuePolling() {
    loadQueue().catch(err => console.error('Initial queue load failed:', err));
    queuePollInterval = setInterval(() => {
        loadQueue().catch(err => console.error('Queue poll failed:', err));
    }, 2000);
}

async function loadQueue() {
    try {
        const data = await fetchJSON('/api/tts/queue');

        if (!data.success) {
            throw new Error(data.error || 'Failed to load queue');
        }

        renderQueue(data.queue);

    } catch (error) {
        console.error('Failed to load queue:', error);
        // Don't show notification for polling errors
    }
}

function renderQueue(queue) {
    const list = document.getElementById('queueList');
    const nowPlaying = document.getElementById('nowPlaying');

    // Render queue list
    if (list) {
        if (!queue.nextItems || queue.nextItems.length === 0) {
            list.innerHTML = '<div class="text-gray-400 text-center py-8">Queue is empty</div>';
        } else {
            list.innerHTML = queue.nextItems.map((item, i) => `
                <div class="bg-gray-700 rounded p-3 flex justify-between items-center">
                    <div>
                        <div class="font-bold">#${i + 1} - ${escapeHtml(item.username)}</div>
                        <div class="text-sm text-gray-400">${escapeHtml(item.text)}</div>
                    </div>
                    <div class="text-sm text-gray-500">Priority: ${item.priority}</div>
                </div>
            `).join('');
        }
    }

    // Render now playing
    if (nowPlaying) {
        if (queue.currentItem) {
            nowPlaying.innerHTML = `
                <div class="bg-gray-700 rounded p-4 pulse">
                    <div class="text-2xl mb-2">🔊</div>
                    <div class="font-bold text-lg">${escapeHtml(queue.currentItem.username)}</div>
                    <div class="text-sm text-gray-400 mt-2">"${escapeHtml(queue.currentItem.text)}"</div>
                </div>
            `;
        } else {
            nowPlaying.innerHTML = '<div class="text-gray-400">No audio playing</div>';
        }
    }
}

async function clearQueue() {
    if (!confirm('Clear entire queue?')) return;

    try {
        const data = await postJSON('/api/tts/queue/clear', {});

        if (!data.success) {
            throw new Error(data.error || 'Failed to clear queue');
        }

        showNotification(`Cleared ${data.cleared} items from queue`, 'success');
        await loadQueue();

    } catch (error) {
        console.error('Failed to clear queue:', error);
        showNotification(`Failed to clear queue: ${error.message}`, 'error');
    }
}

async function skipCurrent() {
    try {
        const data = await postJSON('/api/tts/queue/skip', {});

        if (!data.success) {
            throw new Error(data.error || 'Failed to skip');
        }

        if (data.skipped) {
            showNotification('Skipped current item', 'success');
            await loadQueue();
        } else {
            showNotification('Nothing to skip', 'info');
        }

    } catch (error) {
        console.error('Failed to skip:', error);
        showNotification(`Failed to skip: ${error.message}`, 'error');
    }
}

// ============================================================================
// TEST TTS
// ============================================================================

async function testTTS() {
    const input = document.getElementById('testText');
    if (!input) return;

    const text = input.value.trim();
    if (!text) {
        showNotification('Please enter text to test', 'warning');
        return;
    }

    try {
        const data = await postJSON('/api/tts/speak', {
            text,
            userId: 'admin',
            username: 'Admin',
            source: 'manual'
        });

        if (!data.success) {
            throw new Error(data.error || 'Failed to queue TTS');
        }

        showNotification('TTS queued successfully', 'success');
        input.value = ''; // Clear input
        await loadQueue();

    } catch (error) {
        console.error('Failed to test TTS:', error);
        showNotification(`Failed: ${error.message}`, 'error');
    }
}

// ============================================================================
// STATISTICS
// ============================================================================

function startStatsPolling() {
    loadStats().catch(err => console.error('Initial stats load failed:', err));
    statsPollInterval = setInterval(() => {
        loadStats().catch(err => console.error('Stats poll failed:', err));
    }, 5000);
}

async function loadStats() {
    try {
        const [queueRes, permRes] = await Promise.all([
            fetchJSON('/api/tts/queue'),
            fetchJSON('/api/tts/permissions/stats')
        ]);

        if (queueRes.success && queueRes.stats) {
            renderQueueStats(queueRes.stats);
        }

        if (permRes.success && permRes.stats) {
            renderPermissionStats(permRes.stats);
        }

    } catch (error) {
        console.error('Failed to load stats:', error);
        // Don't show notification for polling errors
    }
}

function renderQueueStats(stats) {
    const el = document.getElementById('queueStats');
    if (!el) return;

    el.innerHTML = `
        <div class="flex justify-between"><span>Total Queued:</span><span class="font-bold">${stats.totalQueued || 0}</span></div>
        <div class="flex justify-between"><span>Total Played:</span><span class="font-bold">${stats.totalPlayed || 0}</span></div>
        <div class="flex justify-between"><span>Total Dropped:</span><span class="font-bold text-red-400">${stats.totalDropped || 0}</span></div>
        <div class="flex justify-between"><span>Rate Limited:</span><span class="font-bold text-yellow-400">${stats.totalRateLimited || 0}</span></div>
        <div class="flex justify-between"><span>Current Queue:</span><span class="font-bold">${stats.currentQueueSize || 0}</span></div>
    `;
}

function renderPermissionStats(stats) {
    const el = document.getElementById('permissionStats');
    if (!el) return;

    el.innerHTML = `
        <div class="flex justify-between"><span>Total Users:</span><span class="font-bold">${stats.total_users || 0}</span></div>
        <div class="flex justify-between"><span>Whitelisted:</span><span class="font-bold text-green-400">${stats.whitelisted_users || 0}</span></div>
        <div class="flex justify-between"><span>Blacklisted:</span><span class="font-bold text-red-400">${stats.blacklisted_users || 0}</span></div>
        <div class="flex justify-between"><span>Voice Assigned:</span><span class="font-bold text-purple-400">${stats.voice_assigned_users || 0}</span></div>
    `;
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

function setupEventListeners() {
    // Tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterUsers(btn.dataset.filter);
        });
    });

    // Range inputs with live value display
    const volumeInput = document.getElementById('volume');
    if (volumeInput) {
        volumeInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('volumeValue');
            if (valueEl) valueEl.textContent = e.target.value;
        });
    }

    const speedInput = document.getElementById('speed');
    if (speedInput) {
        speedInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('speedValue');
            if (valueEl) valueEl.textContent = e.target.value;
        });
    }

    const duckVolumeInput = document.getElementById('duckVolume');
    if (duckVolumeInput) {
        duckVolumeInput.addEventListener('input', (e) => {
            const valueEl = document.getElementById('duckVolumeValue');
            if (valueEl) valueEl.textContent = e.target.value;
        });
    }

    // Engine selector
    const engineSelect = document.getElementById('defaultEngine');
    if (engineSelect) {
        engineSelect.addEventListener('change', () => {
            populateVoiceSelect();
        });
    }

    // User search
    const userSearchInput = document.getElementById('userSearch');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', () => {
            renderUsers();
        });
    }

    // Action buttons
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', saveConfig);
    }

    const clearQueueBtn = document.getElementById('clearQueueBtn');
    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', clearQueue);
    }

    const skipCurrentBtn = document.getElementById('skipCurrentBtn');
    if (skipCurrentBtn) {
        skipCurrentBtn.addEventListener('click', skipCurrent);
    }

    const testTTSBtn = document.getElementById('testTTSBtn');
    if (testTTSBtn) {
        testTTSBtn.addEventListener('click', testTTS);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };

    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-xl z-50 fade-in`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
