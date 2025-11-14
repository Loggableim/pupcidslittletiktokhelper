/**
 * OpenShock Plugin - UI Controller
 * Handles all UI interactions, Socket.IO communication, and API calls
 */

// ====================================================================
// GLOBAL VARIABLES
// ====================================================================

let socket = null;
let config = {};
let devices = [];
let mappings = [];
let patterns = [];
let queueStatus = {};
let stats = {};
let debugLogs = [];
let updateInterval = null;
let currentTab = 'dashboard';

// ====================================================================
// INITIALIZATION
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[OpenShock] Initializing plugin UI...');

    initializeSocket();
    initializeTabs();
    initializeModals();

    await loadInitialData();
    startPeriodicUpdates();

    console.log('[OpenShock] UI initialization complete');
});

// ====================================================================
// SOCKET.IO INITIALIZATION AND HANDLERS
// ====================================================================

function initializeSocket() {
    if (!window.io) {
        console.warn('[OpenShock] Socket.IO not available');
        return;
    }

    socket = window.io({
        path: '/socket.io',
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[OpenShock] Socket.IO connected');
        updateConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
        console.log('[OpenShock] Socket.IO disconnected');
        updateConnectionStatus('disconnected');
    });

    socket.on('error', (error) => {
        console.error('[OpenShock] Socket.IO error:', error);
        updateConnectionStatus('error');
    });

    // OpenShock-specific events
    socket.on('openshock:device-update', (data) => {
        console.log('[OpenShock] Device update:', data);
        handleDeviceUpdate(data);
    });

    socket.on('openshock:command-sent', (data) => {
        console.log('[OpenShock] Command sent:', data);
        handleCommandSent(data);
    });

    socket.on('openshock:queue-update', (data) => {
        console.log('[OpenShock] Queue update:', data);
        handleQueueUpdate(data);
    });

    socket.on('openshock:emergency-stop', (data) => {
        console.log('[OpenShock] Emergency stop triggered:', data);
        handleEmergencyStop(data);
    });

    socket.on('openshock:stats-update', (data) => {
        console.log('[OpenShock] Stats update:', data);
        handleStatsUpdate(data);
    });
}

function handleDeviceUpdate(data) {
    const deviceIndex = devices.findIndex(d => d.id === data.deviceId);
    if (deviceIndex >= 0) {
        devices[deviceIndex] = { ...devices[deviceIndex], ...data };
        renderDeviceList();
    }
}

function handleCommandSent(data) {
    debugLogs.unshift({
        timestamp: new Date().toISOString(),
        type: 'command',
        ...data
    });

    if (debugLogs.length > 100) {
        debugLogs = debugLogs.slice(0, 100);
    }

    if (currentTab === 'dashboard') {
        renderCommandLog(debugLogs.slice(0, 10));
    }
}

function handleQueueUpdate(data) {
    queueStatus = data;
    renderQueueStatus();
}

function handleEmergencyStop(data) {
    showNotification('EMERGENCY STOP ACTIVATED!', 'error');
    document.body.classList.add('emergency-active');
    setTimeout(() => {
        document.body.classList.remove('emergency-active');
    }, 5000);
}

function handleStatsUpdate(data) {
    stats = data;
    renderStats();
}

// ====================================================================
// DATA LOADING FUNCTIONS
// ====================================================================

async function loadInitialData() {
    try {
        await Promise.all([
            loadConfig(),
            loadDevices(),
            loadMappings(),
            loadPatterns(),
            loadStats(),
            loadQueueStatus()
        ]);

        // Render initial UI
        renderDashboard();
        renderDeviceList();
        renderMappingList();
        renderPatternList();

        showNotification('OpenShock plugin loaded successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error loading initial data:', error);
        showNotification('Error loading OpenShock data', 'error');
    }
}

async function loadConfig() {
    try {
        const response = await fetch('/api/openshock/config');
        if (!response.ok) throw new Error('Failed to load config');
        config = await response.json();
        console.log('[OpenShock] Config loaded:', config);

        // Update UI with config
        if (config.apiKey) {
            const apiKeyInput = document.getElementById('openshock-api-key');
            if (apiKeyInput) {
                apiKeyInput.value = config.apiKey.substring(0, 8) + '...' + config.apiKey.substring(config.apiKey.length - 4);
            }
        }

        return config;
    } catch (error) {
        console.error('[OpenShock] Error loading config:', error);
        throw error;
    }
}

async function loadDevices() {
    try {
        const response = await fetch('/api/openshock/devices');
        if (!response.ok) throw new Error('Failed to load devices');
        devices = await response.json();
        console.log('[OpenShock] Devices loaded:', devices);
        return devices;
    } catch (error) {
        console.error('[OpenShock] Error loading devices:', error);
        throw error;
    }
}

async function loadMappings() {
    try {
        const response = await fetch('/api/openshock/mappings');
        if (!response.ok) throw new Error('Failed to load mappings');
        mappings = await response.json();
        console.log('[OpenShock] Mappings loaded:', mappings);
        return mappings;
    } catch (error) {
        console.error('[OpenShock] Error loading mappings:', error);
        throw error;
    }
}

async function loadPatterns() {
    try {
        const response = await fetch('/api/openshock/patterns');
        if (!response.ok) throw new Error('Failed to load patterns');
        patterns = await response.json();
        console.log('[OpenShock] Patterns loaded:', patterns);
        return patterns;
    } catch (error) {
        console.error('[OpenShock] Error loading patterns:', error);
        throw error;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/openshock/stats');
        if (!response.ok) throw new Error('Failed to load stats');
        stats = await response.json();
        console.log('[OpenShock] Stats loaded:', stats);
        return stats;
    } catch (error) {
        console.error('[OpenShock] Error loading stats:', error);
        throw error;
    }
}

async function loadQueueStatus() {
    try {
        const response = await fetch('/api/openshock/queue/status');
        if (!response.ok) throw new Error('Failed to load queue status');
        queueStatus = await response.json();
        console.log('[OpenShock] Queue status loaded:', queueStatus);
        return queueStatus;
    } catch (error) {
        console.error('[OpenShock] Error loading queue status:', error);
        throw error;
    }
}

// ====================================================================
// UI RENDERING FUNCTIONS
// ====================================================================

function renderDashboard() {
    renderStats();
    renderQueueStatus();
    renderCommandLog(debugLogs.slice(0, 10));
    updateConnectionStatus(socket && socket.connected ? 'connected' : 'disconnected');
}

function renderDeviceList() {
    const container = document.getElementById('openshock-device-list');
    if (!container) return;

    if (devices.length === 0) {
        container.innerHTML = `
            <div class="openshock-empty-state">
                <i class="fas fa-plug"></i>
                <p>No devices found</p>
                <button onclick="refreshDevices()" class="openshock-btn openshock-btn-primary">
                    <i class="fas fa-sync"></i> Refresh Devices
                </button>
            </div>
        `;
        return;
    }

    const html = `
        <table class="openshock-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Battery</th>
                    <th>RSSI</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${devices.map(device => `
                    <tr>
                        <td><strong>${escapeHtml(device.name)}</strong></td>
                        <td><code>${escapeHtml(device.id)}</code></td>
                        <td><span class="openshock-badge openshock-badge-info">${escapeHtml(device.type || 'Unknown')}</span></td>
                        <td>
                            <span class="openshock-badge openshock-badge-${device.online ? 'success' : 'secondary'}">
                                ${device.online ? 'Online' : 'Offline'}
                            </span>
                        </td>
                        <td>
                            ${device.battery !== undefined ? `
                                <div class="openshock-battery">
                                    <i class="fas fa-battery-${getBatteryIcon(device.battery)}"></i>
                                    ${device.battery}%
                                </div>
                            ` : '-'}
                        </td>
                        <td>
                            ${device.rssi !== undefined ? `
                                <span class="openshock-signal openshock-signal-${getSignalStrength(device.rssi)}">
                                    ${device.rssi} dBm
                                </span>
                            ` : '-'}
                        </td>
                        <td>
                            <div class="openshock-btn-group">
                                <button onclick="testDevice('${device.id}', 'vibrate')"
                                        class="openshock-btn openshock-btn-sm openshock-btn-secondary"
                                        title="Test Vibrate">
                                    <i class="fas fa-mobile-alt"></i>
                                </button>
                                <button onclick="testDevice('${device.id}', 'shock')"
                                        class="openshock-btn openshock-btn-sm openshock-btn-warning"
                                        title="Test Shock">
                                    <i class="fas fa-bolt"></i>
                                </button>
                                <button onclick="testDevice('${device.id}', 'beep')"
                                        class="openshock-btn openshock-btn-sm openshock-btn-info"
                                        title="Test Beep">
                                    <i class="fas fa-volume-up"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

function renderCommandLog(commands) {
    const container = document.getElementById('openshock-command-log');
    if (!container) return;

    if (commands.length === 0) {
        container.innerHTML = '<div class="openshock-empty-state"><p>No commands yet</p></div>';
        return;
    }

    const html = commands.map(cmd => `
        <div class="openshock-log-entry">
            <div class="openshock-log-time">${formatTimestamp(cmd.timestamp)}</div>
            <div class="openshock-log-content">
                <span class="openshock-badge openshock-badge-${getCommandTypeColor(cmd.type)}">${cmd.type}</span>
                <strong>${escapeHtml(cmd.deviceName || cmd.deviceId)}</strong>
                ${cmd.intensity ? `<span class="openshock-intensity">${cmd.intensity}%</span>` : ''}
                ${cmd.duration ? `<span class="openshock-duration">${cmd.duration}ms</span>` : ''}
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderMappingList() {
    const container = document.getElementById('openshock-mapping-list');
    if (!container) return;

    if (mappings.length === 0) {
        container.innerHTML = `
            <div class="openshock-empty-state">
                <i class="fas fa-link"></i>
                <p>No mappings configured</p>
                <button onclick="openMappingModal()" class="openshock-btn openshock-btn-primary">
                    <i class="fas fa-plus"></i> Create Mapping
                </button>
            </div>
        `;
        return;
    }

    const html = mappings.map(mapping => `
        <div class="openshock-mapping-card ${mapping.enabled ? '' : 'openshock-mapping-disabled'}">
            <div class="openshock-mapping-header">
                <h4>${escapeHtml(mapping.name)}</h4>
                <div class="openshock-mapping-actions">
                    <label class="openshock-switch">
                        <input type="checkbox" ${mapping.enabled ? 'checked' : ''}
                               onchange="toggleMapping('${mapping.id}', this.checked)">
                        <span class="openshock-slider"></span>
                    </label>
                    <button onclick="openMappingModal('${mapping.id}')"
                            class="openshock-btn openshock-btn-sm openshock-btn-secondary">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteMapping('${mapping.id}')"
                            class="openshock-btn openshock-btn-sm openshock-btn-danger">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="openshock-mapping-body">
                <div class="openshock-mapping-trigger">
                    <strong>Trigger:</strong>
                    <span class="openshock-badge openshock-badge-info">${escapeHtml(mapping.trigger.type)}</span>
                    ${renderTriggerDetails(mapping.trigger)}
                </div>
                <div class="openshock-mapping-action">
                    <strong>Action:</strong>
                    <span class="openshock-badge openshock-badge-warning">${escapeHtml(mapping.action.type)}</span>
                    ${renderActionDetails(mapping.action)}
                </div>
                ${mapping.conditions && mapping.conditions.length > 0 ? `
                    <div class="openshock-mapping-conditions">
                        <strong>Conditions:</strong>
                        ${mapping.conditions.map(c => `<span class="openshock-condition-badge">${escapeHtml(c.type)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
            <div class="openshock-mapping-footer">
                <small>Triggered: ${mapping.stats?.triggered || 0} times</small>
                <small>Last: ${mapping.stats?.lastTriggered ? formatTimestamp(mapping.stats.lastTriggered) : 'Never'}</small>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderPatternList() {
    const container = document.getElementById('openshock-pattern-list');
    if (!container) return;

    if (patterns.length === 0) {
        container.innerHTML = `
            <div class="openshock-empty-state">
                <i class="fas fa-wave-square"></i>
                <p>No patterns configured</p>
                <button onclick="openPatternModal()" class="openshock-btn openshock-btn-primary">
                    <i class="fas fa-plus"></i> Create Pattern
                </button>
            </div>
        `;
        return;
    }

    const html = patterns.map(pattern => `
        <div class="openshock-pattern-card">
            <div class="openshock-pattern-header">
                <h4>${escapeHtml(pattern.name)}</h4>
                <div class="openshock-pattern-actions">
                    <button onclick="openPatternModal('${pattern.id}')"
                            class="openshock-btn openshock-btn-sm openshock-btn-secondary">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deletePattern('${pattern.id}')"
                            class="openshock-btn openshock-btn-sm openshock-btn-danger">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="openshock-pattern-body">
                ${pattern.description ? `<p class="openshock-pattern-description">${escapeHtml(pattern.description)}</p>` : ''}
                <div class="openshock-pattern-preview">
                    ${renderPatternTimeline(pattern.steps)}
                </div>
                <div class="openshock-pattern-info">
                    <span><i class="fas fa-layer-group"></i> ${pattern.steps.length} steps</span>
                    <span><i class="fas fa-clock"></i> ${formatDuration(calculatePatternDuration(pattern.steps))}</span>
                </div>
            </div>
            <div class="openshock-pattern-footer">
                <select id="pattern-device-${pattern.id}" class="openshock-select openshock-select-sm">
                    <option value="">Select device...</option>
                    ${devices.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
                </select>
                <button onclick="executePattern('${pattern.id}', document.getElementById('pattern-device-${pattern.id}').value)"
                        class="openshock-btn openshock-btn-sm openshock-btn-primary">
                    <i class="fas fa-play"></i> Execute
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderQueueStatus() {
    const container = document.getElementById('openshock-queue-status');
    if (!container) return;

    const html = `
        <div class="openshock-queue-stats">
            <div class="openshock-stat-item">
                <span class="openshock-stat-label">Pending</span>
                <span class="openshock-stat-value">${queueStatus.pending || 0}</span>
            </div>
            <div class="openshock-stat-item">
                <span class="openshock-stat-label">Processing</span>
                <span class="openshock-stat-value">${queueStatus.processing || 0}</span>
            </div>
            <div class="openshock-stat-item">
                <span class="openshock-stat-label">Completed</span>
                <span class="openshock-stat-value">${queueStatus.completed || 0}</span>
            </div>
            <div class="openshock-stat-item">
                <span class="openshock-stat-label">Failed</span>
                <span class="openshock-stat-value openshock-text-danger">${queueStatus.failed || 0}</span>
            </div>
        </div>
        ${queueStatus.pending > 0 ? `
            <button onclick="clearQueue()" class="openshock-btn openshock-btn-sm openshock-btn-warning">
                <i class="fas fa-times"></i> Clear Queue
            </button>
        ` : ''}
    `;

    container.innerHTML = html;
}

function renderStats() {
    const container = document.getElementById('openshock-stats');
    if (!container) return;

    const html = `
        <div class="openshock-stats-grid">
            <div class="openshock-stat-card">
                <i class="fas fa-bolt"></i>
                <div class="openshock-stat-content">
                    <span class="openshock-stat-value">${stats.totalCommands || 0}</span>
                    <span class="openshock-stat-label">Total Commands</span>
                </div>
            </div>
            <div class="openshock-stat-card">
                <i class="fas fa-check-circle"></i>
                <div class="openshock-stat-content">
                    <span class="openshock-stat-value">${stats.successfulCommands || 0}</span>
                    <span class="openshock-stat-label">Successful</span>
                </div>
            </div>
            <div class="openshock-stat-card">
                <i class="fas fa-exclamation-triangle"></i>
                <div class="openshock-stat-content">
                    <span class="openshock-stat-value openshock-text-danger">${stats.failedCommands || 0}</span>
                    <span class="openshock-stat-label">Failed</span>
                </div>
            </div>
            <div class="openshock-stat-card">
                <i class="fas fa-link"></i>
                <div class="openshock-stat-content">
                    <span class="openshock-stat-value">${stats.activeMappings || 0}</span>
                    <span class="openshock-stat-label">Active Mappings</span>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function updateConnectionStatus(status) {
    const badge = document.getElementById('openshock-connection-status');
    if (!badge) return;

    badge.className = 'openshock-connection-badge';

    if (status === 'connected') {
        badge.classList.add('openshock-connection-connected');
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
    } else if (status === 'disconnected') {
        badge.classList.add('openshock-connection-disconnected');
        badge.innerHTML = '<i class="fas fa-times-circle"></i> Disconnected';
    } else {
        badge.classList.add('openshock-connection-error');
        badge.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
    }
}

// ====================================================================
// MAPPING CRUD FUNCTIONS
// ====================================================================

function openMappingModal(mappingId = null) {
    const modal = document.getElementById('openshock-mapping-modal');
    if (!modal) return;

    const isEdit = mappingId !== null;
    const mapping = isEdit ? mappings.find(m => m.id === mappingId) : null;

    // Set modal title
    document.getElementById('mapping-modal-title').textContent = isEdit ? 'Edit Mapping' : 'Create Mapping';

    // Populate form
    document.getElementById('mapping-id').value = mappingId || '';
    document.getElementById('mapping-name').value = mapping?.name || '';
    document.getElementById('mapping-enabled').checked = mapping?.enabled !== false;

    // Trigger configuration
    document.getElementById('mapping-trigger-type').value = mapping?.trigger.type || 'gift';
    populateTriggerFields(mapping?.trigger);

    // Action configuration
    document.getElementById('mapping-action-type').value = mapping?.action.type || 'shock';
    document.getElementById('mapping-action-device').value = mapping?.action.deviceId || '';
    populateActionFields(mapping?.action);

    openModal('openshock-mapping-modal');
}

function populateTriggerFields(trigger) {
    const type = trigger?.type || document.getElementById('mapping-trigger-type').value;
    const container = document.getElementById('mapping-trigger-fields');

    let html = '';

    if (type === 'gift') {
        html = `
            <div class="openshock-form-group">
                <label>Gift Name (optional)</label>
                <input type="text" id="trigger-gift-name" class="openshock-input"
                       placeholder="Leave empty for any gift" value="${trigger?.giftName || ''}">
            </div>
            <div class="openshock-form-group">
                <label>Minimum Coins</label>
                <input type="number" id="trigger-min-coins" class="openshock-input"
                       value="${trigger?.minCoins || 0}" min="0">
            </div>
        `;
    } else if (type === 'follow') {
        html = `<p class="openshock-help-text">Triggers on new followers</p>`;
    } else if (type === 'share') {
        html = `<p class="openshock-help-text">Triggers when someone shares the stream</p>`;
    } else if (type === 'viewer_count') {
        html = `
            <div class="openshock-form-group">
                <label>Threshold</label>
                <input type="number" id="trigger-viewer-threshold" class="openshock-input"
                       value="${trigger?.threshold || 100}" min="0">
            </div>
        `;
    } else if (type === 'keyword') {
        html = `
            <div class="openshock-form-group">
                <label>Keywords (comma-separated)</label>
                <input type="text" id="trigger-keywords" class="openshock-input"
                       placeholder="zap, shock, buzz" value="${trigger?.keywords?.join(', ') || ''}">
            </div>
        `;
    }

    container.innerHTML = html;
}

function populateActionFields(action) {
    const type = action?.type || document.getElementById('mapping-action-type').value;
    const container = document.getElementById('mapping-action-fields');

    let html = `
        <div class="openshock-form-group">
            <label>Intensity (%)</label>
            <input type="range" id="action-intensity" class="openshock-slider"
                   min="1" max="100" value="${action?.intensity || 50}"
                   oninput="document.getElementById('action-intensity-value').textContent = this.value">
            <span id="action-intensity-value">${action?.intensity || 50}</span>%
        </div>
        <div class="openshock-form-group">
            <label>Duration (ms)</label>
            <input type="number" id="action-duration" class="openshock-input"
                   min="100" max="30000" step="100" value="${action?.duration || 1000}">
        </div>
    `;

    container.innerHTML = html;
}

async function saveMappingModal() {
    const mappingId = document.getElementById('mapping-id').value;
    const isEdit = mappingId !== '';

    const mapping = {
        name: document.getElementById('mapping-name').value,
        enabled: document.getElementById('mapping-enabled').checked,
        trigger: collectTriggerData(),
        action: collectActionData()
    };

    try {
        const url = isEdit ? `/api/openshock/mappings/${mappingId}` : '/api/openshock/mappings';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapping)
        });

        if (!response.ok) throw new Error('Failed to save mapping');

        await loadMappings();
        renderMappingList();
        closeModal('openshock-mapping-modal');

        showNotification(`Mapping ${isEdit ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving mapping:', error);
        showNotification('Error saving mapping', 'error');
    }
}

function collectTriggerData() {
    const type = document.getElementById('mapping-trigger-type').value;
    const trigger = { type };

    if (type === 'gift') {
        const giftName = document.getElementById('trigger-gift-name')?.value;
        const minCoins = document.getElementById('trigger-min-coins')?.value;
        if (giftName) trigger.giftName = giftName;
        if (minCoins) trigger.minCoins = parseInt(minCoins);
    } else if (type === 'viewer_count') {
        trigger.threshold = parseInt(document.getElementById('trigger-viewer-threshold')?.value || 100);
    } else if (type === 'keyword') {
        const keywords = document.getElementById('trigger-keywords')?.value;
        trigger.keywords = keywords ? keywords.split(',').map(k => k.trim()) : [];
    }

    return trigger;
}

function collectActionData() {
    return {
        type: document.getElementById('mapping-action-type').value,
        deviceId: document.getElementById('mapping-action-device').value,
        intensity: parseInt(document.getElementById('action-intensity')?.value || 50),
        duration: parseInt(document.getElementById('action-duration')?.value || 1000)
    };
}

async function deleteMapping(id) {
    if (!await confirmAction('Are you sure you want to delete this mapping?')) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/mappings/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete mapping');

        await loadMappings();
        renderMappingList();
        showNotification('Mapping deleted successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting mapping:', error);
        showNotification('Error deleting mapping', 'error');
    }
}

async function toggleMapping(id, enabled) {
    try {
        const response = await fetch(`/api/openshock/mappings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        if (!response.ok) throw new Error('Failed to toggle mapping');

        await loadMappings();
        renderMappingList();
        showNotification(`Mapping ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error toggling mapping:', error);
        showNotification('Error toggling mapping', 'error');
    }
}

async function importMappings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/openshock/mappings/import', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Failed to import mappings');

            await loadMappings();
            renderMappingList();
            showNotification('Mappings imported successfully', 'success');
        } catch (error) {
            console.error('[OpenShock] Error importing mappings:', error);
            showNotification('Error importing mappings', 'error');
        }
    };

    input.click();
}

async function exportMappings() {
    try {
        const response = await fetch('/api/openshock/mappings/export');
        if (!response.ok) throw new Error('Failed to export mappings');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openshock-mappings-${Date.now()}.json`;
        a.click();
        window.URL.revokeObjectURL(url);

        showNotification('Mappings exported successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error exporting mappings:', error);
        showNotification('Error exporting mappings', 'error');
    }
}

// ====================================================================
// PATTERN CRUD FUNCTIONS
// ====================================================================

let currentPatternSteps = [];

function openPatternModal(patternId = null) {
    const modal = document.getElementById('openshock-pattern-modal');
    if (!modal) return;

    const isEdit = patternId !== null;
    const pattern = isEdit ? patterns.find(p => p.id === patternId) : null;

    document.getElementById('pattern-modal-title').textContent = isEdit ? 'Edit Pattern' : 'Create Pattern';

    document.getElementById('pattern-id').value = patternId || '';
    document.getElementById('pattern-name').value = pattern?.name || '';
    document.getElementById('pattern-description').value = pattern?.description || '';

    currentPatternSteps = pattern?.steps ? JSON.parse(JSON.stringify(pattern.steps)) : [];
    renderPatternSteps();

    openModal('openshock-pattern-modal');
}

function renderPatternSteps() {
    const container = document.getElementById('pattern-steps-list');
    if (!container) return;

    if (currentPatternSteps.length === 0) {
        container.innerHTML = '<p class="openshock-help-text">No steps added yet. Click "Add Step" to begin.</p>';
        return;
    }

    const html = currentPatternSteps.map((step, index) => `
        <div class="openshock-pattern-step">
            <div class="openshock-pattern-step-number">${index + 1}</div>
            <div class="openshock-pattern-step-content">
                <span class="openshock-badge openshock-badge-${getCommandTypeColor(step.type)}">${step.type}</span>
                <span>Intensity: ${step.intensity}%</span>
                <span>Duration: ${step.duration}ms</span>
                ${step.delay ? `<span>Delay: ${step.delay}ms</span>` : ''}
            </div>
            <button onclick="removePatternStep(${index})" class="openshock-btn openshock-btn-sm openshock-btn-danger">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    container.innerHTML = html;
    renderPatternPreview();
}

function addPatternStep() {
    const step = {
        type: document.getElementById('step-type').value,
        intensity: parseInt(document.getElementById('step-intensity').value),
        duration: parseInt(document.getElementById('step-duration').value),
        delay: parseInt(document.getElementById('step-delay').value) || 0
    };

    currentPatternSteps.push(step);
    renderPatternSteps();

    // Reset form
    document.getElementById('step-intensity').value = 50;
    document.getElementById('step-duration').value = 1000;
    document.getElementById('step-delay').value = 0;
}

function removePatternStep(index) {
    currentPatternSteps.splice(index, 1);
    renderPatternSteps();
}

function renderPatternPreview() {
    const container = document.getElementById('pattern-preview');
    if (!container) return;

    container.innerHTML = renderPatternTimeline(currentPatternSteps);
}

function renderPatternTimeline(steps) {
    if (!steps || steps.length === 0) return '';

    const totalDuration = calculatePatternDuration(steps);
    let currentTime = 0;

    const bars = steps.map(step => {
        const startPercent = (currentTime / totalDuration) * 100;
        const widthPercent = (step.duration / totalDuration) * 100;
        currentTime += step.duration + (step.delay || 0);

        return `
            <div class="openshock-timeline-bar openshock-timeline-${step.type}"
                 style="left: ${startPercent}%; width: ${widthPercent}%;"
                 title="${step.type} - ${step.intensity}% - ${step.duration}ms">
            </div>
        `;
    }).join('');

    return `
        <div class="openshock-timeline">
            ${bars}
        </div>
        <div class="openshock-timeline-labels">
            <span>0ms</span>
            <span>${formatDuration(totalDuration)}</span>
        </div>
    `;
}

async function savePatternModal() {
    const patternId = document.getElementById('pattern-id').value;
    const isEdit = patternId !== '';

    if (currentPatternSteps.length === 0) {
        showNotification('Pattern must have at least one step', 'error');
        return;
    }

    const pattern = {
        name: document.getElementById('pattern-name').value,
        description: document.getElementById('pattern-description').value,
        steps: currentPatternSteps
    };

    try {
        const url = isEdit ? `/api/openshock/patterns/${patternId}` : '/api/openshock/patterns';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });

        if (!response.ok) throw new Error('Failed to save pattern');

        await loadPatterns();
        renderPatternList();
        closeModal('openshock-pattern-modal');

        showNotification(`Pattern ${isEdit ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving pattern:', error);
        showNotification('Error saving pattern', 'error');
    }
}

async function deletePattern(id) {
    if (!await confirmAction('Are you sure you want to delete this pattern?')) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/patterns/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete pattern');

        await loadPatterns();
        renderPatternList();
        showNotification('Pattern deleted successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error deleting pattern:', error);
        showNotification('Error deleting pattern', 'error');
    }
}

async function executePattern(id, deviceId) {
    if (!deviceId) {
        showNotification('Please select a device', 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/patterns/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patternId: id, deviceId })
        });

        if (!response.ok) throw new Error('Failed to execute pattern');

        showNotification('Pattern execution started', 'success');
    } catch (error) {
        console.error('[OpenShock] Error executing pattern:', error);
        showNotification('Error executing pattern', 'error');
    }
}

function generateFromCurve() {
    // Open curve generator modal
    const curveType = prompt('Enter curve type (linear, exponential, sine, pulse):');
    if (!curveType) return;

    const steps = parseInt(prompt('Enter number of steps (5-20):', '10'));
    if (!steps || steps < 5 || steps > 20) return;

    const duration = parseInt(prompt('Enter step duration (ms):', '500'));
    if (!duration) return;

    // Generate pattern based on curve
    currentPatternSteps = [];

    for (let i = 0; i < steps; i++) {
        let intensity;
        const progress = i / (steps - 1);

        if (curveType === 'linear') {
            intensity = Math.round(10 + (progress * 90));
        } else if (curveType === 'exponential') {
            intensity = Math.round(10 + (Math.pow(progress, 2) * 90));
        } else if (curveType === 'sine') {
            intensity = Math.round(50 + (Math.sin(progress * Math.PI * 2) * 40));
        } else if (curveType === 'pulse') {
            intensity = i % 2 === 0 ? 80 : 20;
        } else {
            intensity = 50;
        }

        currentPatternSteps.push({
            type: 'shock',
            intensity: Math.min(100, Math.max(1, intensity)),
            duration,
            delay: 100
        });
    }

    renderPatternSteps();
    showNotification('Pattern generated from curve', 'success');
}

// ====================================================================
// SAFETY FUNCTIONS
// ====================================================================

async function loadSafetyConfig() {
    // Safety config is part of main config
    const maxIntensity = config.safety?.maxIntensity || 100;
    const maxDuration = config.safety?.maxDuration || 5000;
    const cooldown = config.safety?.cooldown || 1000;

    document.getElementById('safety-max-intensity').value = maxIntensity;
    document.getElementById('safety-max-duration').value = maxDuration;
    document.getElementById('safety-cooldown').value = cooldown;
}

async function saveSafetyConfig() {
    const safety = {
        maxIntensity: parseInt(document.getElementById('safety-max-intensity').value),
        maxDuration: parseInt(document.getElementById('safety-max-duration').value),
        cooldown: parseInt(document.getElementById('safety-cooldown').value)
    };

    try {
        const response = await fetch('/api/openshock/safety', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safety)
        });

        if (!response.ok) throw new Error('Failed to save safety config');

        await loadConfig();
        showNotification('Safety configuration saved', 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving safety config:', error);
        showNotification('Error saving safety configuration', 'error');
    }
}

async function triggerEmergencyStop() {
    if (!await confirmAction('EMERGENCY STOP - This will immediately stop all active commands. Continue?')) {
        return;
    }

    try {
        const response = await fetch('/api/openshock/emergency-stop', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to trigger emergency stop');

        showNotification('EMERGENCY STOP ACTIVATED', 'error');
    } catch (error) {
        console.error('[OpenShock] Error triggering emergency stop:', error);
        showNotification('Error triggering emergency stop', 'error');
    }
}

async function clearEmergencyStop() {
    try {
        const response = await fetch('/api/openshock/emergency-clear', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to clear emergency stop');

        showNotification('Emergency stop cleared', 'success');
    } catch (error) {
        console.error('[OpenShock] Error clearing emergency stop:', error);
        showNotification('Error clearing emergency stop', 'error');
    }
}

// ====================================================================
// ADVANCED FUNCTIONS
// ====================================================================

async function saveApiSettings() {
    const apiKey = document.getElementById('openshock-api-key').value;

    if (!apiKey || apiKey.includes('...')) {
        showNotification('Please enter a valid API key', 'error');
        return;
    }

    try {
        const response = await fetch('/api/openshock/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey })
        });

        if (!response.ok) throw new Error('Failed to save API settings');

        await loadConfig();
        showNotification('API settings saved successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error saving API settings:', error);
        showNotification('Error saving API settings', 'error');
    }
}

async function testConnection() {
    const button = document.querySelector('[onclick="testConnection()"]');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    }

    try {
        const response = await fetch('/api/openshock/test-connection', {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showNotification('Connection successful!', 'success');
        } else {
            throw new Error(result.error || 'Connection failed');
        }
    } catch (error) {
        console.error('[OpenShock] Connection test failed:', error);
        showNotification(`Connection failed: ${error.message}`, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
        }
    }
}

async function refreshDevices() {
    const button = document.querySelector('[onclick="refreshDevices()"]');
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    }

    try {
        const response = await fetch('/api/openshock/devices/refresh', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to refresh devices');

        await loadDevices();
        renderDeviceList();
        showNotification('Devices refreshed successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error refreshing devices:', error);
        showNotification('Error refreshing devices', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-sync"></i> Refresh Devices';
        }
    }
}

async function clearQueue() {
    if (!await confirmAction('Clear all pending commands from the queue?')) {
        return;
    }

    try {
        const response = await fetch('/api/openshock/queue/clear', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to clear queue');

        await loadQueueStatus();
        renderQueueStatus();
        showNotification('Queue cleared successfully', 'success');
    } catch (error) {
        console.error('[OpenShock] Error clearing queue:', error);
        showNotification('Error clearing queue', 'error');
    }
}

async function testDevice(deviceId, type) {
    if (!await confirmAction(`Send test ${type} command to device?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/openshock/test/${deviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, intensity: 30, duration: 500 })
        });

        if (!response.ok) throw new Error('Failed to send test command');

        showNotification('Test command sent', 'success');
    } catch (error) {
        console.error('[OpenShock] Error testing device:', error);
        showNotification('Error sending test command', 'error');
    }
}

// ====================================================================
// TAB SYSTEM
// ====================================================================

function initializeTabs() {
    const tabButtons = document.querySelectorAll('[data-tab]');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;

    // Update tab buttons
    document.querySelectorAll('[data-tab]').forEach(button => {
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.openshock-tab-pane').forEach(pane => {
        if (pane.id === `openshock-tab-${tabId}`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    // Load tab-specific data
    if (tabId === 'safety') {
        loadSafetyConfig();
    }
}

// ====================================================================
// MODAL SYSTEM
// ====================================================================

function initializeModals() {
    // Close modal on backdrop click
    document.querySelectorAll('.openshock-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // Close modal on close button click
    document.querySelectorAll('[data-close-modal]').forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.closest('.openshock-modal').id;
            closeModal(modalId);
        });
    });

    // Event listeners for dynamic form updates
    const triggerTypeSelect = document.getElementById('mapping-trigger-type');
    if (triggerTypeSelect) {
        triggerTypeSelect.addEventListener('change', () => populateTriggerFields());
    }

    const actionTypeSelect = document.getElementById('mapping-action-type');
    if (actionTypeSelect) {
        actionTypeSelect.addEventListener('change', () => populateActionFields());
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `openshock-notification openshock-notification-${type}`;

    const icon = type === 'success' ? 'check-circle' :
                 type === 'error' ? 'exclamation-circle' :
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function confirmAction(message) {
    return new Promise((resolve) => {
        const confirmed = confirm(message);
        resolve(confirmed);
    });
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleString();
}

function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getBatteryIcon(level) {
    if (level > 75) return 'full';
    if (level > 50) return 'three-quarters';
    if (level > 25) return 'half';
    if (level > 10) return 'quarter';
    return 'empty';
}

function getSignalStrength(rssi) {
    if (rssi > -50) return 'excellent';
    if (rssi > -60) return 'good';
    if (rssi > -70) return 'fair';
    return 'poor';
}

function getCommandTypeColor(type) {
    const colors = {
        shock: 'danger',
        vibrate: 'warning',
        beep: 'info',
        sound: 'info'
    };
    return colors[type] || 'secondary';
}

function renderTriggerDetails(trigger) {
    if (trigger.type === 'gift' && trigger.giftName) {
        return `<span class="openshock-detail">${escapeHtml(trigger.giftName)}</span>`;
    }
    if (trigger.type === 'gift' && trigger.minCoins) {
        return `<span class="openshock-detail">Min ${trigger.minCoins} coins</span>`;
    }
    if (trigger.type === 'viewer_count') {
        return `<span class="openshock-detail">Threshold: ${trigger.threshold}</span>`;
    }
    if (trigger.type === 'keyword' && trigger.keywords) {
        return `<span class="openshock-detail">${trigger.keywords.join(', ')}</span>`;
    }
    return '';
}

function renderActionDetails(action) {
    return `
        <span class="openshock-detail">${action.intensity}%</span>
        <span class="openshock-detail">${action.duration}ms</span>
    `;
}

function calculatePatternDuration(steps) {
    return steps.reduce((total, step) => total + step.duration + (step.delay || 0), 0);
}

// ====================================================================
// PERIODIC UPDATES
// ====================================================================

function startPeriodicUpdates() {
    // Initial update
    updatePeriodicData();

    // Set interval for 5 seconds
    updateInterval = setInterval(updatePeriodicData, 5000);
}

async function updatePeriodicData() {
    try {
        await Promise.all([
            loadQueueStatus(),
            loadStats()
        ]);

        if (currentTab === 'dashboard') {
            renderQueueStatus();
            renderStats();
        }
    } catch (error) {
        console.error('[OpenShock] Error updating periodic data:', error);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    if (socket) {
        socket.disconnect();
    }
});

// Export functions for global access
window.openShock = {
    openMappingModal,
    saveMappingModal,
    deleteMapping,
    toggleMapping,
    importMappings,
    exportMappings,
    openPatternModal,
    savePatternModal,
    deletePattern,
    executePattern,
    addPatternStep,
    removePatternStep,
    generateFromCurve,
    saveApiSettings,
    testConnection,
    refreshDevices,
    clearQueue,
    testDevice,
    saveSafetyConfig,
    triggerEmergencyStop,
    clearEmergencyStop,
    switchTab
};

console.log('[OpenShock] Plugin UI loaded and ready');
