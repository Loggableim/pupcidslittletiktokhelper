/**
 * Dashboard Enhancements
 * New Features: Quick Action Buttons, FAQ, Changelog, Runtime Tracking, Compact Resources
 */

(() => {
    'use strict';

    // ========== STATE ==========
    let streamStartTime = null;
    let runtimeInterval = null;
    let runtimeSparklineData = [];
    const MAX_SPARKLINE_POINTS = 60;

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', () => {
        initializeQuickActionButtons();
        initializeFAQAccordion();
        initializeChangelog();
        initializeCompactResources();
        initializeRuntimeTracking();
        initializeResourceDetailsLink();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });

    // ========== QUICK ACTION BUTTONS ==========
    async function initializeQuickActionButtons() {
        console.log('[Dashboard Enhancements] Initializing Quick Action Buttons');

        // Load initial states
        await loadQuickActionButtonStates();

        // Attach click handlers to all quick action buttons
        const buttons = document.querySelectorAll('.quick-action-btn');
        console.log(`[Dashboard Enhancements] Found ${buttons.length} quick action buttons`);

        buttons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const action = button.getAttribute('data-action');
                const currentState = button.getAttribute('data-state');

                console.log(`[Quick Action] Clicked: ${action}, current state: ${currentState}`);

                // Toggle state
                const newState = currentState === 'on' ? 'off' : 'on';

                // Update UI immediately for better UX
                button.setAttribute('data-state', newState);

                // Send to server
                const success = await toggleQuickAction(action, newState === 'on');

                // Revert if failed
                if (!success) {
                    console.error(`[Quick Action] Failed to toggle ${action}, reverting`);
                    button.setAttribute('data-state', currentState);
                } else {
                    console.log(`[Quick Action] Successfully toggled ${action} to ${newState}`);
                }

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        });
    }

    async function loadQuickActionButtonStates() {
        try {
            console.log('[Load Quick Action States] Fetching settings from /api/settings');

            // Load settings for TTS, Soundboard, and Flows
            const settingsResponse = await fetch('/api/settings');
            const settings = await settingsResponse.json();

            console.log('[Load Quick Action States] Settings loaded:', settings);

            // Set button states
            const ttsBtn = document.getElementById('quick-tts-btn');
            if (ttsBtn) {
                const state = settings.tts_enabled !== 'false' ? 'on' : 'off';
                ttsBtn.setAttribute('data-state', state);
                console.log(`[Load Quick Action States] TTS button set to: ${state} (tts_enabled=${settings.tts_enabled})`);
            }

            const soundboardBtn = document.getElementById('quick-soundboard-btn');
            if (soundboardBtn) {
                const state = settings.soundboard_enabled !== 'false' ? 'on' : 'off';
                soundboardBtn.setAttribute('data-state', state);
                console.log(`[Load Quick Action States] Soundboard button set to: ${state}`);
            }

            const flowsBtn = document.getElementById('quick-flows-btn');
            if (flowsBtn) {
                const state = settings.flows_enabled !== 'false' ? 'on' : 'off';
                flowsBtn.setAttribute('data-state', state);
                console.log(`[Load Quick Action States] Flows button set to: ${state}`);
            }

            // Load Emoji Rain state from plugin
            try {
                const emojiRainResponse = await fetch('/api/emoji-rain/status');
                const emojiRainData = await emojiRainResponse.json();
                const emojiRainBtn = document.getElementById('quick-emoji-rain-btn');
                if (emojiRainBtn && emojiRainData.success) {
                    emojiRainBtn.setAttribute('data-state', emojiRainData.enabled !== false ? 'on' : 'off');
                }
            } catch (error) {
                console.log('Emoji Rain status not available');
            }

            // Load OSC-Bridge state
            try {
                const oscResponse = await fetch('/api/settings');
                const oscSettings = await oscResponse.json();
                const oscBtn = document.getElementById('quick-osc-bridge-btn');
                if (oscBtn) {
                    oscBtn.setAttribute('data-state', oscSettings.osc_bridge_enabled === 'true' ? 'on' : 'off');
                }
            } catch (error) {
                console.log('OSC-Bridge status not available');
            }

        } catch (error) {
            console.error('Error loading Quick Action states:', error);
        }
    }

    async function toggleQuickAction(action, enabled) {
        console.log(`[Toggle Quick Action] ${action}:`, enabled ? 'ON' : 'OFF');

        try {
            let endpoint, body;

            switch (action) {
                case 'tts':
                    endpoint = '/api/settings';
                    body = { tts_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'soundboard':
                    endpoint = '/api/settings';
                    body = { soundboard_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'flows':
                    endpoint = '/api/settings';
                    body = { flows_enabled: enabled ? 'true' : 'false' };
                    break;

                case 'emoji-rain':
                    endpoint = '/api/emoji-rain/toggle';
                    body = { enabled };
                    break;

                case 'osc-bridge':
                    endpoint = '/api/settings';
                    body = { osc_bridge_enabled: enabled ? 'true' : 'false' };
                    break;

                default:
                    console.warn(`[Toggle Quick Action] Unknown action: ${action}`);
                    return false;
            }

            console.log(`[Toggle Quick Action] Sending to ${endpoint}:`, body);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            console.log(`[Toggle Quick Action] Response status:`, response.status);

            const result = await response.json();
            console.log(`[Toggle Quick Action] Response data:`, result);

            if (result.success) {
                // Clear TTS queue when disabling TTS
                if (action === 'tts' && !enabled) {
                    try {
                        console.log('[Toggle Quick Action] Clearing TTS queue...');
                        const clearResponse = await fetch('/api/tts/queue/clear', { method: 'POST' });
                        const clearResult = await clearResponse.json();
                        if (clearResult.success) {
                            console.log('[Toggle Quick Action] TTS queue cleared successfully');
                        } else {
                            console.warn('[Toggle Quick Action] Failed to clear TTS queue:', clearResult.error);
                        }
                    } catch (clearError) {
                        console.error('[Toggle Quick Action] Error clearing TTS queue:', clearError);
                    }
                }

                showQuickActionNotification(action, enabled);
                return true;
            } else {
                console.error(`[Toggle Quick Action] Failed to toggle ${action}:`, result.error);
                return false;
            }

        } catch (error) {
            console.error(`[Toggle Quick Action] Error toggling ${action}:`, error);
            return false;
        }
    }

    function showQuickActionNotification(action, enabled) {
        const actionNames = {
            'tts': 'Text-to-Speech',
            'soundboard': 'Soundboard',
            'flows': 'Automation Flows',
            'emoji-rain': 'Emoji Rain',
            'osc-bridge': 'OSC-Bridge'
        };

        const name = actionNames[action] || action;
        const status = enabled ? 'aktiviert' : 'deaktiviert';
        const icon = enabled ? '✅' : '⏸️';

        console.log(`${icon} ${name} ${status}`);
    }

    // ========== FAQ ACCORDION ==========
    function initializeFAQAccordion() {
        const faqToggles = document.querySelectorAll('.faq-toggle');

        faqToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const faqItem = toggle.closest('.faq-item');
                const isActive = faqItem.classList.contains('active');

                // Close all other items (optional: comment out for multi-open accordion)
                document.querySelectorAll('.faq-item').forEach(item => {
                    if (item !== faqItem) {
                        item.classList.remove('active');
                    }
                });

                // Toggle current item
                faqItem.classList.toggle('active');

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        });
    }

    // ========== UPDATE CHECKER & CHANGELOG LOADER ==========
    async function initializeChangelog() {
        const updatesSection = document.getElementById('updates-section');
        const updatesContent = document.getElementById('updates-content');
        const dismissBtn = document.getElementById('dismiss-updates-btn');
        const showMoreBtn = document.getElementById('show-more-changelog-btn');

        if (!updatesSection || !updatesContent) return;

        // Check if updates section was dismissed
        const isDismissed = localStorage.getItem('updates-dismissed') === 'true';
        if (isDismissed) {
            updatesSection.style.display = 'none';
            return;
        }

        // Dismiss button
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                updatesSection.style.display = 'none';
                localStorage.setItem('updates-dismissed', 'true');
            });
        }

        // Check for updates first
        try {
            const updateResponse = await fetch('/api/update/check');
            const updateData = await updateResponse.json();

            if (updateData.success && updateData.available) {
                // Show update notification
                const updateHTML = `
                    <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.05) 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <i data-lucide="download" style="width: 20px; height: 20px; color: #22c55e;"></i>
                            <strong style="color: #22c55e;">Neue Version verfügbar: ${updateData.latestVersion}</strong>
                        </div>
                        <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 0.75rem 0;">
                            Aktuelle Version: ${updateData.currentVersion}
                        </p>
                        <div style="display: flex; gap: 0.5rem;">
                            <a href="${updateData.releaseUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" style="text-decoration: none;">
                                <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                                Release ansehen
                            </a>
                        </div>
                    </div>
                `;
                updatesContent.innerHTML = updateHTML;
                
                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            } else {
                // No updates available, try to load changelog
                await loadChangelog();
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            // Fallback to loading changelog
            await loadChangelog();
        }

        async function loadChangelog() {
            try {
                const response = await fetch('/CHANGELOG.txt');
                const changelogText = await response.text();

                const changelogHTML = parseChangelog(changelogText, 2); // Show first 2 versions
                updatesContent.innerHTML = changelogHTML;

                // Show "More" button if there are more versions
                if (showMoreBtn) {
                    showMoreBtn.style.display = 'block';
                    showMoreBtn.addEventListener('click', async () => {
                        const fullChangelogHTML = parseChangelog(changelogText); // Show all
                        updatesContent.innerHTML = fullChangelogHTML;
                        showMoreBtn.style.display = 'none';
                    });
                }

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }

            } catch (error) {
                console.error('Error loading changelog:', error);
                updatesContent.innerHTML = '<p style="color: var(--color-text-muted);">Keine Updates verfügbar.</p>';
            }
        }
    }

    function parseChangelog(text, maxVersions = null) {
        const lines = text.split('\n');
        let html = '';
        let versionCount = 0;
        let currentVersion = null;
        let currentSection = null;
        let items = [];

        for (const line of lines) {
            // Version header: ## [1.0.2] - 2025-11-09
            if (line.startsWith('## [') && line.includes(']')) {
                // Flush previous section
                if (currentSection && items.length > 0) {
                    html += `<div class="changelog-section">
                        <div class="changelog-section-title ${currentSection.toLowerCase()}">${currentSection}</div>
                        <ul class="changelog-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
                    </div>`;
                    items = [];
                }

                // Flush previous version
                if (currentVersion) {
                    html += '</div>';
                    versionCount++;
                    if (maxVersions && versionCount >= maxVersions) break;
                }

                const versionMatch = line.match(/## \[(.+?)\](?: - (.+))?/);
                if (versionMatch) {
                    const version = versionMatch[1];
                    const date = versionMatch[2] || '';

                    if (version !== 'Unreleased') {
                        html += `<div class="changelog-version">
                            <div class="changelog-version-header">
                                <span class="changelog-version-number">v${version}</span>
                                ${date ? `<span class="changelog-version-date">${date}</span>` : ''}
                            </div>`;
                        currentVersion = version;
                        currentSection = null;
                    }
                }
            }
            // Section header: ### Added
            else if (line.startsWith('### ')) {
                // Flush previous section
                if (currentSection && items.length > 0) {
                    html += `<div class="changelog-section">
                        <div class="changelog-section-title ${currentSection.toLowerCase()}">${currentSection}</div>
                        <ul class="changelog-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
                    </div>`;
                    items = [];
                }

                currentSection = line.substring(4).trim();
            }
            // List item: - Feature description
            else if (line.startsWith('- ') && currentVersion && currentSection) {
                const item = line.substring(2).trim();
                // Only take first level bullets (not sub-items)
                if (!item.startsWith(' ')) {
                    items.push(item);
                }
            }
        }

        // Flush final section
        if (currentSection && items.length > 0) {
            html += `<div class="changelog-section">
                <div class="changelog-section-title ${currentSection.toLowerCase()}">${currentSection}</div>
                <ul class="changelog-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
            </div>`;
        }

        // Flush final version
        if (currentVersion) {
            html += '</div>';
        }

        return html || '<p style="color: var(--color-text-muted);">Keine Updates verfügbar.</p>';
    }

    // ========== RUNTIME TRACKING & SPARKLINE ==========
    function initializeRuntimeTracking() {
        // Listen for connection events
        if (typeof socket !== 'undefined' && socket !== null) {
            socket.on('tiktok:connected', (data) => {
                startRuntimeTracking();
            });

            socket.on('tiktok:disconnected', () => {
                stopRuntimeTracking();
            });
        }
    }

    function startRuntimeTracking() {
        streamStartTime = Date.now();
        runtimeSparklineData = [];

        // Update runtime every second
        runtimeInterval = setInterval(() => {
            updateRuntime();
        }, 1000);
    }

    function stopRuntimeTracking() {
        streamStartTime = null;

        if (runtimeInterval) {
            clearInterval(runtimeInterval);
            runtimeInterval = null;
        }

        const runtimeElement = document.getElementById('stat-runtime');
        if (runtimeElement) {
            runtimeElement.textContent = '--:--:--';
        }

        runtimeSparklineData = [];
        drawRuntimeSparkline();
    }

    function updateRuntime() {
        if (!streamStartTime) return;

        const elapsed = Date.now() - streamStartTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        const runtimeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const runtimeElement = document.getElementById('stat-runtime');
        if (runtimeElement) {
            runtimeElement.textContent = runtimeString;
        }

        // Add to sparkline data every 10 seconds
        if (seconds % 10 === 0) {
            runtimeSparklineData.push(minutes + hours * 60);
            if (runtimeSparklineData.length > MAX_SPARKLINE_POINTS) {
                runtimeSparklineData.shift();
            }
            drawRuntimeSparkline();
        }
    }

    function drawRuntimeSparkline() {
        const canvas = document.getElementById('runtime-sparkline');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (runtimeSparklineData.length < 2) return;

        // Calculate scaling
        const max = Math.max(...runtimeSparklineData, 1);
        const step = width / (runtimeSparklineData.length - 1);

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';

        runtimeSparklineData.forEach((value, index) => {
            const x = index * step;
            const y = height - (value / max) * height;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }

    // ========== COMPACT RESOURCES ==========
    function initializeCompactResources() {
        // This is a lightweight version that mirrors the main resource monitor
        setInterval(() => {
            updateCompactResources();
        }, 2000);
    }

    async function updateCompactResources() {
        try {
            // Try to get real resource data from resource monitor plugin
            const response = await fetch('/api/resource-monitor/metrics');
            const data = await response.json();

            if (data.success && data.metrics) {
                const { cpu, memory, ram, gpu, network } = data.metrics;

                // Update CPU
                updateCompactResource('cpu', cpu.usage || 0);

                // Update RAM (try both 'ram' and 'memory' for compatibility)
                const ramData = ram || memory;
                updateCompactResource('ram', ramData?.usedPercent || ramData?.percent || 0);

                // Update GPU (if available)
                if (gpu && Array.isArray(gpu) && gpu.length > 0 && gpu[0].utilizationGpu !== null) {
                    const gpuUsage = gpu[0].utilizationGpu || 0;
                    const gpuElement = document.getElementById('resource-gpu-compact');
                    if (gpuElement) {
                        gpuElement.textContent = gpuUsage.toFixed(1) + '%';
                    }

                    // Update GPU sparkline
                    updateGPUSparkline(gpuUsage);
                } else {
                    const gpuElement = document.getElementById('resource-gpu-compact');
                    if (gpuElement) {
                        gpuElement.textContent = 'N/A';
                    }
                }

                // Update Network (if available)
                if (network) {
                    const rxSec = network.rx_sec || 0;
                    const txSec = network.tx_sec || 0;
                    const totalSec = rxSec + txSec;

                    const networkElement = document.getElementById('resource-network-compact');
                    if (networkElement) {
                        networkElement.textContent = formatBytesShort(totalSec) + '/s';
                    }

                    // Update network sparkline
                    updateNetworkSparkline(totalSec);
                }
            }

        } catch (error) {
            // Fallback to mock data if plugin not available
            updateCompactResource('cpu', Math.random() * 10);
            updateCompactResource('ram', 30 + Math.random() * 20);
        }
    }

    function updateCompactResource(type, value) {
        const valueElement = document.getElementById(`resource-${type}-compact`);
        const barElement = document.getElementById(`resource-${type}-bar-compact`);

        if (valueElement) {
            valueElement.textContent = value.toFixed(1) + '%';
        }

        if (barElement) {
            barElement.style.width = Math.min(value, 100) + '%';

            // Color based on threshold
            if (value > 80) {
                barElement.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
            } else if (value > 60) {
                barElement.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
            } else {
                barElement.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)';
            }
        }
    }

    // ========== SPARKLINE DATA ==========
    let gpuSparklineData = [];
    let networkSparklineData = [];
    const MAX_SPARKLINE_DATA_POINTS = 20;

    function updateGPUSparkline(value) {
        gpuSparklineData.push(value);
        if (gpuSparklineData.length > MAX_SPARKLINE_DATA_POINTS) {
            gpuSparklineData.shift();
        }
        drawSparkline('gpu-sparkline', gpuSparklineData, '#8b5cf6');
    }

    function updateNetworkSparkline(value) {
        networkSparklineData.push(value / 1024); // Convert to KB/s
        if (networkSparklineData.length > MAX_SPARKLINE_DATA_POINTS) {
            networkSparklineData.shift();
        }
        drawSparkline('network-sparkline', networkSparklineData, '#3b82f6');
    }

    function drawSparkline(canvasId, data, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (data.length < 2) return;

        // Calculate scaling
        const max = Math.max(...data, 1);
        const step = width / (data.length - 1);

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';

        data.forEach((value, index) => {
            const x = index * step;
            const y = height - (value / max) * height;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }

    function formatBytesShort(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ========== RESOURCE DETAILS LINK ==========
    function initializeResourceDetailsLink() {
        const detailsLink = document.querySelector('.resource-details-link');
        if (detailsLink) {
            detailsLink.addEventListener('click', (e) => {
                e.preventDefault();
                const view = detailsLink.getAttribute('data-view');
                if (view && typeof NavigationManager !== 'undefined') {
                    NavigationManager.switchView(view);
                }
            });
        }
    }

    // ========== EXPORTS ==========
    window.DashboardEnhancements = {
        reloadChangelog: initializeChangelog,
        resetUpdatesDismissal: () => {
            localStorage.removeItem('updates-dismissed');
            const updatesSection = document.getElementById('updates-section');
            if (updatesSection) {
                updatesSection.style.display = '';
                initializeChangelog();
            }
        }
    };

})();
