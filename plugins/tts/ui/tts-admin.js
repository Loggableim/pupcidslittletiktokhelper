// TTS Admin Panel JavaScript
let socket = null;

/**
 * HTML escape function to prevent XSS attacks
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Initialize Socket.io with error handling
try {
    if (typeof io !== 'undefined') {
        socket = io();
        console.log('✓ Socket.io connected');
    } else {
        console.warn('⚠ Socket.io not available - using polling only');
    }
} catch (error) {
    console.error('Socket.io initialization error:', error);
}

let currentConfig = {};
let currentUsers = [];
let currentFilter = 'all';
let voices = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 TTS Admin Panel initializing...');

    // Update status
    const statusEl = document.getElementById('init-status');
    if (statusEl) statusEl.textContent = 'Loading configuration...';

    try {
        await loadConfig();
        console.log('✓ Config loaded');
        if (statusEl) statusEl.textContent = 'Loading voices...';
    } catch (error) {
        console.error('✗ Config load failed:', error);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500">✗ Config load failed - see console</span>';
        showNotification('Failed to load configuration: ' + error.message, 'error');
        return; // Stop initialization on critical error
    }

    try {
        await loadVoices();
        console.log('✓ Voices loaded');
        if (statusEl) statusEl.textContent = 'Loading users...';
    } catch (error) {
        console.error('✗ Voices load failed:', error);
        if (statusEl) statusEl.innerHTML = '<span class="text-red-500">✗ Voices load failed - see console</span>';
        showNotification('Failed to load voices: ' + error.message, 'error');
        return;
    }

    try {
        await loadUsers();
        console.log('✓ Users loaded');
        if (statusEl) statusEl.textContent = 'Loading statistics...';
    } catch (error) {
        console.error('✗ Users load failed:', error);
        // Non-critical, continue
    }

    try {
        await loadStats();
        console.log('✓ Stats loaded');
    } catch (error) {
        console.error('✗ Stats load failed:', error);
        // Non-critical, continue
    }

    setupEventListeners();
    startQueuePolling();
    startStatsPolling();

    console.log('✓ TTS Admin Panel initialized successfully');

    // Hide debug info
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) debugInfo.style.display = 'none';

    // Update status
    if (statusEl) statusEl.innerHTML = '<span class="text-green-500">✓ Initialized successfully</span>';
});

// Tab switching
function switchTab(tab) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(el => {
        el.classList.remove('border-blue-500', 'text-blue-400');
        el.classList.add('border-transparent', 'text-gray-400');
    });

    // Show selected tab
    document.getElementById(`content-${tab}`).classList.remove('hidden');
    const btn = document.getElementById(`tab-${tab}`);
    btn.classList.remove('border-transparent', 'text-gray-400');
    btn.classList.add('border-blue-500', 'text-blue-400');
}

// Load configuration
async function loadConfig() {
    try {
        const res = await fetch('/api/tts/config');
        const data = await res.json();

        if (data.success) {
            currentConfig = data.config;
            populateConfig(currentConfig);
        }
    } catch (error) {
        console.error('Failed to load config:', error);
        showNotification('Failed to load configuration', 'error');
    }
}

// Populate config form
function populateConfig(config) {
    document.getElementById('defaultEngine').value = config.defaultEngine || 'tiktok';
    document.getElementById('volume').value = config.volume || 80;
    document.getElementById('volumeValue').textContent = config.volume || 80;
    document.getElementById('speed').value = config.speed || 1.0;
    document.getElementById('speedValue').textContent = config.speed || 1.0;
    document.getElementById('teamMinLevel').value = config.teamMinLevel || 0;
    document.getElementById('rateLimit').value = config.rateLimit || 3;
    document.getElementById('rateLimitWindow').value = config.rateLimitWindow || 60;
    document.getElementById('maxQueueSize').value = config.maxQueueSize || 100;
    document.getElementById('maxTextLength').value = config.maxTextLength || 300;
    document.getElementById('cacheTTL').value = config.cacheTTL || 86400;
    document.getElementById('profanityFilter').value = config.profanityFilter || 'moderate';
    document.getElementById('duckOtherAudio').checked = config.duckOtherAudio || false;
    document.getElementById('duckVolume').value = (config.duckVolume || 0.3) * 100;
    document.getElementById('duckVolumeValue').textContent = Math.round((config.duckVolume || 0.3) * 100);
    document.getElementById('enabledForChat').checked = config.enabledForChat !== false;
    document.getElementById('autoLanguageDetection').checked = config.autoLanguageDetection !== false;

    if (config.googleApiKey && config.googleApiKey !== '***HIDDEN***') {
        document.getElementById('googleApiKey').value = config.googleApiKey;
    }
}

// Save configuration
async function saveConfig() {
    try {
        const config = {
            defaultEngine: document.getElementById('defaultEngine').value,
            defaultVoice: document.getElementById('defaultVoice').value,
            volume: parseInt(document.getElementById('volume').value),
            speed: parseFloat(document.getElementById('speed').value),
            teamMinLevel: parseInt(document.getElementById('teamMinLevel').value),
            rateLimit: parseInt(document.getElementById('rateLimit').value),
            rateLimitWindow: parseInt(document.getElementById('rateLimitWindow').value),
            maxQueueSize: parseInt(document.getElementById('maxQueueSize').value),
            maxTextLength: parseInt(document.getElementById('maxTextLength').value),
            cacheTTL: parseInt(document.getElementById('cacheTTL').value),
            profanityFilter: document.getElementById('profanityFilter').value,
            duckOtherAudio: document.getElementById('duckOtherAudio').checked,
            duckVolume: parseInt(document.getElementById('duckVolume').value) / 100,
            enabledForChat: document.getElementById('enabledForChat').checked,
            autoLanguageDetection: document.getElementById('autoLanguageDetection').checked
        };

        const apiKey = document.getElementById('googleApiKey').value;
        if (apiKey && apiKey !== '***HIDDEN***') {
            config.googleApiKey = apiKey;
        }

        const res = await fetch('/api/tts/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const data = await res.json();

        if (data.success) {
            currentConfig = data.config;
            showNotification('Configuration saved successfully', 'success');
        } else {
            showNotification('Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Failed to save config:', error);
        showNotification('Failed to save configuration', 'error');
    }
}

// Load available voices
async function loadVoices() {
    try {
        const res = await fetch('/api/tts/voices?engine=all');
        const data = await res.json();

        if (data.success) {
            voices = data.voices;
            populateVoiceSelect();
        }
    } catch (error) {
        console.error('Failed to load voices:', error);
    }
}

// Populate voice select dropdown
function populateVoiceSelect() {
    const select = document.getElementById('defaultVoice');
    select.innerHTML = '';

    const engine = document.getElementById('defaultEngine').value;

    if (engine === 'tiktok' && voices.tiktok) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'TikTok TTS';

        Object.entries(voices.tiktok).forEach(([id, voice]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = voice.name;
            optgroup.appendChild(option);
        });

        select.appendChild(optgroup);
    }

    if (engine === 'google' && voices.google) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Google Cloud TTS';

        Object.entries(voices.google).forEach(([id, voice]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = voice.name;
            optgroup.appendChild(option);
        });

        select.appendChild(optgroup);
    }

    // Set current default voice
    if (currentConfig.defaultVoice) {
        select.value = currentConfig.defaultVoice;
    }
}

// Load users
async function loadUsers(filter = 'all') {
    try {
        const res = await fetch(`/api/tts/users?filter=${filter === 'all' ? '' : filter}`);
        const data = await res.json();

        if (data.success) {
            currentUsers = data.users;
            renderUsers();
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

// Filter users
function filterUsers(filter) {
    currentFilter = filter;
    loadUsers(filter === 'all' ? null : filter);
}

// Render users list
function renderUsers() {
    const list = document.getElementById('userList');
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();

    const filtered = currentUsers.filter(user =>
        user.username.toLowerCase().includes(searchTerm) ||
        user.user_id.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">No users found</div>';
        return;
    }

    list.innerHTML = filtered.map(user => `
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
                ${!user.allow_tts ? `
                    <button onclick="allowUser('${escapeHtml(user.user_id)}', '${escapeHtml(user.username)}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                        Allow
                    </button>
                ` : `
                    <button onclick="denyUser('${escapeHtml(user.user_id)}', '${escapeHtml(user.username)}')" class="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm">
                        Revoke
                    </button>
                `}
                ${!user.is_blacklisted ? `
                    <button onclick="blacklistUser('${escapeHtml(user.user_id)}', '${escapeHtml(user.username)}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">
                        Blacklist
                    </button>
                ` : `
                    <button onclick="unblacklistUser('${escapeHtml(user.user_id)}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">
                        Unblacklist
                    </button>
                `}
                <button onclick="assignVoiceDialog('${escapeHtml(user.user_id)}', '${escapeHtml(user.username)}')" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm">
                    ${user.assigned_voice_id ? 'Change' : 'Assign'} Voice
                </button>
            </div>
        </div>
    `).join('');
}

// User management functions
async function allowUser(userId, username) {
    try {
        const res = await fetch(`/api/tts/users/${userId}/allow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (res.ok) {
            showNotification(`TTS allowed for ${username}`, 'success');
            loadUsers(currentFilter);
        }
    } catch (error) {
        showNotification('Failed to update user', 'error');
    }
}

async function denyUser(userId, username) {
    try {
        const res = await fetch(`/api/tts/users/${userId}/deny`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (res.ok) {
            showNotification(`TTS revoked for ${username}`, 'success');
            loadUsers(currentFilter);
        }
    } catch (error) {
        showNotification('Failed to update user', 'error');
    }
}

async function blacklistUser(userId, username) {
    if (!confirm(`Are you sure you want to blacklist ${username}?`)) return;

    try {
        const res = await fetch(`/api/tts/users/${userId}/blacklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (res.ok) {
            showNotification(`${username} has been blacklisted`, 'success');
            loadUsers(currentFilter);
        }
    } catch (error) {
        showNotification('Failed to blacklist user', 'error');
    }
}

async function unblacklistUser(userId) {
    try {
        const res = await fetch(`/api/tts/users/${userId}/unblacklist`, {
            method: 'POST'
        });

        if (res.ok) {
            showNotification('User removed from blacklist', 'success');
            loadUsers(currentFilter);
        }
    } catch (error) {
        showNotification('Failed to unblacklist user', 'error');
    }
}

// Voice Assignment Modal State
let modalState = {
    userId: null,
    username: null,
    selectedVoiceId: null,
    selectedEngine: 'tiktok'
};

function assignVoiceDialog(userId, username) {
    modalState.userId = userId;
    modalState.username = username;
    modalState.selectedVoiceId = null;
    modalState.selectedEngine = 'tiktok';

    const modal = document.getElementById('voiceAssignmentModal');
    const usernameEl = document.getElementById('modalUsername');
    const engineSelect = document.getElementById('modalEngine');
    const voiceSearch = document.getElementById('modalVoiceSearch');

    if (usernameEl) usernameEl.textContent = username;
    if (engineSelect) {
        engineSelect.value = 'tiktok';
        engineSelect.onchange = () => {
            modalState.selectedEngine = engineSelect.value;
            renderModalVoiceList();
        };
    }
    if (voiceSearch) {
        voiceSearch.value = '';
        voiceSearch.oninput = renderModalVoiceList;
    }

    renderModalVoiceList();

    if (modal) modal.classList.remove('hidden');

    const confirmBtn = document.getElementById('confirmVoiceAssignment');
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            if (!modalState.selectedVoiceId) {
                showNotification('Please select a voice', 'error');
                return;
            }
            await assignVoice(modalState.userId, modalState.username, modalState.selectedVoiceId, modalState.selectedEngine);
            closeVoiceAssignmentModal();
        };
    }
}

function closeVoiceAssignmentModal() {
    const modal = document.getElementById('voiceAssignmentModal');
    if (modal) modal.classList.add('hidden');
    modalState = { userId: null, username: null, selectedVoiceId: null, selectedEngine: 'tiktok' };
}

function renderModalVoiceList() {
    const list = document.getElementById('modalVoiceList');
    if (!list) return;

    const engine = modalState.selectedEngine;
    const voiceList = voices[engine];
    const searchTerm = document.getElementById('modalVoiceSearch')?.value.toLowerCase() || '';

    if (!voiceList || Object.keys(voiceList).length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-4">No voices available for this engine</div>';
        return;
    }

    const filteredVoices = Object.entries(voiceList).filter(([id, voice]) =>
        id.toLowerCase().includes(searchTerm) ||
        voice.name.toLowerCase().includes(searchTerm) ||
        (voice.language && voice.language.toLowerCase().includes(searchTerm))
    );

    if (filteredVoices.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-4">No voices match your search</div>';
        return;
    }

    list.innerHTML = filteredVoices.map(([id, voice]) => `
        <div
            onclick="selectModalVoice('${escapeHtml(id)}')"
            class="voice-option p-3 rounded cursor-pointer hover:bg-gray-600 ${modalState.selectedVoiceId === id ? 'bg-blue-600' : 'bg-gray-800'}"
            data-voice-id="${escapeHtml(id)}"
        >
            <div class="font-bold">${escapeHtml(id)}</div>
            <div class="text-sm text-gray-300">${escapeHtml(voice.name)}</div>
            ${voice.language ? `<div class="text-xs text-gray-400">${escapeHtml(voice.language)}</div>` : ''}
        </div>
    `).join('');
}

function selectModalVoice(voiceId) {
    modalState.selectedVoiceId = voiceId;
    renderModalVoiceList();
}

async function assignVoice(userId, username, voiceId, engine) {
    try {
        const res = await fetch(`/api/tts/users/${userId}/voice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, voiceId, engine })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to assign voice');
        }

        showNotification(`Voice assigned to ${username}`, 'success');
        loadUsers(currentFilter);
    } catch (error) {
        console.error('Failed to assign voice:', error);
        showNotification(`Failed to assign voice: ${error.message}`, 'error');
    }
}

// Queue management
let queuePollInterval = null;

function startQueuePolling() {
    queuePollInterval = setInterval(loadQueue, 2000);
}

async function loadQueue() {
    try {
        const res = await fetch('/api/tts/queue');
        const data = await res.json();

        if (data.success) {
            renderQueue(data.queue);
        }
    } catch (error) {
        console.error('Failed to load queue:', error);
    }
}

function renderQueue(queue) {
    const list = document.getElementById('queueList');

    if (!queue.nextItems || queue.nextItems.length === 0) {
        list.innerHTML = '<div class="text-gray-400 text-center py-8">Queue is empty</div>';
    } else {
        list.innerHTML = queue.nextItems.map((item, i) => `
            <div class="bg-gray-700 rounded p-3 flex justify-between items-center">
                <div>
                    <div class="font-bold">#${i + 1} - ${item.username}</div>
                    <div class="text-sm text-gray-400">${item.text}</div>
                </div>
                <div class="text-sm text-gray-500">Priority: ${item.priority}</div>
            </div>
        `).join('');
    }

    // Now playing
    const nowPlaying = document.getElementById('nowPlaying');
    if (queue.currentItem) {
        nowPlaying.innerHTML = `
            <div class="bg-gray-700 rounded p-4 pulse">
                <div class="text-2xl mb-2">🔊</div>
                <div class="font-bold text-lg">${queue.currentItem.username}</div>
                <div class="text-sm text-gray-400 mt-2">"${queue.currentItem.text}"</div>
            </div>
        `;
    } else {
        nowPlaying.innerHTML = '<div class="text-gray-400">No audio playing</div>';
    }
}

async function clearQueue() {
    if (!confirm('Clear entire queue?')) return;

    try {
        const res = await fetch('/api/tts/queue/clear', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showNotification(`Cleared ${data.cleared} items from queue`, 'success');
            loadQueue();
        }
    } catch (error) {
        showNotification('Failed to clear queue', 'error');
    }
}

async function skipCurrent() {
    try {
        const res = await fetch('/api/tts/queue/skip', { method: 'POST' });
        const data = await res.json();

        if (data.success && data.skipped) {
            showNotification('Skipped current item', 'success');
            loadQueue();
        } else {
            showNotification('Nothing to skip', 'info');
        }
    } catch (error) {
        showNotification('Failed to skip', 'error');
    }
}

// Test TTS
async function testTTS() {
    const text = document.getElementById('testText').value;
    if (!text) return;

    try {
        const res = await fetch('/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                userId: 'admin',
                username: 'Admin',
                source: 'manual'
            })
        });

        const data = await res.json();

        if (data.success) {
            showNotification('TTS queued successfully', 'success');
            loadQueue();
        } else {
            showNotification(`Failed: ${data.error}`, 'error');
        }
    } catch (error) {
        showNotification('Failed to send TTS', 'error');
    }
}

// Statistics
let statsPollInterval = null;

function startStatsPolling() {
    loadStats();
    statsPollInterval = setInterval(loadStats, 5000);
}

async function loadStats() {
    try {
        const [queue, permissions, cache] = await Promise.all([
            fetch('/api/tts/queue').then(r => r.json()),
            fetch('/api/tts/permissions/stats').then(r => r.json()),
            fetch('/api/tts/cache/stats').then(r => r.json())
        ]);

        if (queue.success) {
            renderQueueStats(queue.stats);
        }

        if (permissions.success) {
            renderPermissionStats(permissions.stats);
        }

        if (cache.success) {
            renderCacheStats(cache.stats);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
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

function renderCacheStats(stats) {
    const el = document.getElementById('cacheStats');
    if (!el) return;

    el.innerHTML = `
        <div class="flex justify-between"><span>Total Entries:</span><span class="font-bold">${stats.totalEntries || 0}</span></div>
        <div class="flex justify-between"><span>Total Uses:</span><span class="font-bold">${stats.totalUses || 0}</span></div>
        <div class="flex justify-between"><span>Avg Uses/Entry:</span><span class="font-bold">${stats.avgUses || 0}</span></div>
        <div class="flex justify-between"><span>Cache Size:</span><span class="font-bold">${stats.totalSizeMB || 0} MB</span></div>
        <div class="flex justify-between"><span>Files on Disk:</span><span class="font-bold">${stats.fileCount || 0}</span></div>
        <div class="flex justify-between"><span>TTL:</span><span class="font-bold">${(stats.ttl / 3600).toFixed(1)} hours</span></div>
    `;
}

async function clearCache() {
    if (!confirm('Clear all cached TTS audio?')) return;

    try {
        const res = await fetch('/api/tts/cache/clear', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showNotification('Cache cleared successfully', 'success');
            loadStats();
        } else {
            showNotification('Failed to clear cache', 'error');
        }
    } catch (error) {
        showNotification('Failed to clear cache', 'error');
    }
}

// Event listeners
function setupEventListeners() {
    document.getElementById('volume').addEventListener('input', (e) => {
        document.getElementById('volumeValue').textContent = e.target.value;
    });

    document.getElementById('speed').addEventListener('input', (e) => {
        document.getElementById('speedValue').textContent = e.target.value;
    });

    document.getElementById('duckVolume').addEventListener('input', (e) => {
        document.getElementById('duckVolumeValue').textContent = e.target.value;
    });

    document.getElementById('defaultEngine').addEventListener('change', () => {
        populateVoiceSelect();
    });

    document.getElementById('userSearch').addEventListener('input', () => {
        renderUsers();
    });
}

// Notification system
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
