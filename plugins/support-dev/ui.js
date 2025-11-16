/**
 * Support the Development - UI Controller
 */

(function() {
    'use strict';

    const socket = io();
    let currentStatus = null;
    let currentMode = 'simple';

    // Initialize when page loads
    document.addEventListener('DOMContentLoaded', () => {
        initializeUI();
        loadStatus();
        setupSocketListeners();
        checkFirstRun();
    });

    /**
     * Initialize UI elements and event listeners
     */
    function initializeUI() {
        // Mode switcher
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');
                switchMode(mode);
            });
        });

        // Simple mode buttons
        document.getElementById('supportButton').addEventListener('click', enableSupport);
        document.getElementById('dontSupportButton').addEventListener('click', disableSupport);

        // Advanced mode controls
        document.getElementById('gpuLoad').addEventListener('input', (e) => {
            document.getElementById('gpuLoadValue').textContent = e.target.value + '%';
        });

        document.getElementById('cpuLoad').addEventListener('input', (e) => {
            document.getElementById('cpuLoadValue').textContent = e.target.value + '%';
        });

        document.getElementById('idleTime').addEventListener('input', (e) => {
            document.getElementById('idleTimeValue').textContent = e.target.value + 's';
        });

        document.getElementById('saveAdvancedSettings').addEventListener('click', saveAdvancedSettings);

        // First run modal buttons
        document.getElementById('firstRunYes').addEventListener('click', () => {
            enableSupport();
            completeFirstRun();
            hideFirstRunModal();
        });

        document.getElementById('firstRunNo').addEventListener('click', () => {
            disableSupport();
            completeFirstRun();
            hideFirstRunModal();
        });
    }

    /**
     * Setup Socket.IO listeners
     */
    function setupSocketListeners() {
        socket.on('support-dev:status', (status) => {
            currentStatus = status;
            updateUI(status);
        });

        // Request initial status
        socket.emit('support-dev:request-status');

        // Poll for updates every 10 seconds
        setInterval(() => {
            socket.emit('support-dev:request-status');
        }, 10000);
    }

    /**
     * Load current status from server
     */
    async function loadStatus() {
        try {
            const response = await fetch('/api/support-dev/status');
            const status = await response.json();
            currentStatus = status;
            updateUI(status);
        } catch (error) {
            console.error('Error loading status:', error);
        }
    }

    /**
     * Check if first run popup should be shown
     */
    async function checkFirstRun() {
        try {
            const response = await fetch('/api/support-dev/status');
            const status = await response.json();
            
            if (!status.firstRunCompleted) {
                showFirstRunModal();
            }
        } catch (error) {
            console.error('Error checking first run:', error);
        }
    }

    /**
     * Show first run modal
     */
    function showFirstRunModal() {
        const modal = document.getElementById('firstRunModal');
        modal.style.display = 'flex';
    }

    /**
     * Hide first run modal
     */
    function hideFirstRunModal() {
        const modal = document.getElementById('firstRunModal');
        modal.style.display = 'none';
    }

    /**
     * Mark first run as completed
     */
    async function completeFirstRun() {
        try {
            await fetch('/api/support-dev/first-run-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Error completing first run:', error);
        }
    }

    /**
     * Switch between Simple and Advanced mode
     */
    function switchMode(mode) {
        currentMode = mode;
        
        // Update buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.getAttribute('data-mode') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content
        document.querySelectorAll('.mode-content').forEach(content => {
            content.classList.remove('active');
        });

        if (mode === 'simple') {
            document.getElementById('simpleMode').classList.add('active');
        } else {
            document.getElementById('advancedMode').classList.add('active');
            loadAdvancedSettings();
        }
    }

    /**
     * Enable support
     */
    async function enableSupport() {
        try {
            const response = await fetch('/api/support-dev/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true })
            });

            if (response.ok) {
                showNotification('✅ Thank you for supporting development!', 'success');
                loadStatus();
            }
        } catch (error) {
            console.error('Error enabling support:', error);
            showNotification('❌ Error enabling support', 'error');
        }
    }

    /**
     * Disable support
     */
    async function disableSupport() {
        try {
            const response = await fetch('/api/support-dev/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false })
            });

            if (response.ok) {
                showNotification('Support disabled', 'info');
                loadStatus();
            }
        } catch (error) {
            console.error('Error disabling support:', error);
            showNotification('❌ Error disabling support', 'error');
        }
    }

    /**
     * Load advanced settings
     */
    async function loadAdvancedSettings() {
        try {
            const response = await fetch('/api/support-dev/config');
            const config = await response.json();

            // Update controls
            document.getElementById('gpuEnabled').checked = config.gpu.enabled;
            document.getElementById('cpuEnabled').checked = config.cpu.enabled;
            
            document.getElementById('gpuLoad').value = config.gpu.maxLoad;
            document.getElementById('gpuLoadValue').textContent = config.gpu.maxLoad + '%';
            
            document.getElementById('cpuLoad').value = config.cpu.maxLoad;
            document.getElementById('cpuLoadValue').textContent = config.cpu.maxLoad + '%';
            
            document.getElementById('idleTime').value = config.idle.startAfterSeconds;
            document.getElementById('idleTimeValue').textContent = config.idle.startAfterSeconds + 's';
        } catch (error) {
            console.error('Error loading advanced settings:', error);
        }
    }

    /**
     * Save advanced settings
     */
    async function saveAdvancedSettings() {
        try {
            const config = {
                gpu: {
                    enabled: document.getElementById('gpuEnabled').checked,
                    maxLoad: parseInt(document.getElementById('gpuLoad').value)
                },
                cpu: {
                    enabled: document.getElementById('cpuEnabled').checked,
                    maxLoad: parseInt(document.getElementById('cpuLoad').value)
                },
                idle: {
                    startAfterSeconds: parseInt(document.getElementById('idleTime').value)
                }
            };

            const response = await fetch('/api/support-dev/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                showNotification('✅ Settings saved successfully', 'success');
                loadStatus();
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('❌ Error saving settings', 'error');
        }
    }

    /**
     * Update UI with current status
     */
    function updateUI(status) {
        // Simple mode status
        const simpleStatus = document.getElementById('simpleStatus');
        if (status.enabled) {
            if (status.isActive) {
                simpleStatus.className = 'status-indicator status-active';
                simpleStatus.innerHTML = '<span>●</span><span>Active - Contributing!</span>';
            } else if (status.idle && status.idle.isIdle) {
                simpleStatus.className = 'status-indicator status-idle';
                simpleStatus.innerHTML = '<span>●</span><span>Waiting for Idle...</span>';
            } else {
                simpleStatus.className = 'status-indicator status-idle';
                simpleStatus.innerHTML = '<span>●</span><span>Ready - Waiting for Idle</span>';
            }
        } else {
            simpleStatus.className = 'status-indicator status-inactive';
            simpleStatus.innerHTML = '<span>●</span><span>Not Supporting</span>';
        }

        // Advanced mode status
        const contributionStatus = document.getElementById('contributionStatus');
        if (status.isActive) {
            contributionStatus.className = 'status-indicator status-active';
            contributionStatus.innerHTML = '<span>●</span> Active';
        } else {
            contributionStatus.className = 'status-indicator status-inactive';
            contributionStatus.innerHTML = '<span>●</span> Not Active';
        }

        // System state
        const systemState = document.getElementById('systemState');
        if (status.idle) {
            systemState.textContent = status.idle.isIdle ? '💤 Idle' : '⚡ Active';
        } else {
            systemState.textContent = 'Checking...';
        }

        // Stats display
        if (status.processes) {
            const statsDisplay = document.getElementById('statsDisplay');
            let html = '<div class="grid grid-cols-2 gap-4">';
            
            // GPU stats
            html += '<div>';
            html += '<strong>GPU:</strong><br>';
            html += `Status: ${status.processes.isRunning.gpu ? '✅ Running' : '⏸️ Stopped'}<br>`;
            if (status.processes.stats.gpu.hashrate > 0) {
                html += `Hashrate: ${status.processes.stats.gpu.hashrate.toFixed(2)} MH/s<br>`;
            }
            if (status.processes.stats.gpu.temperature > 0) {
                html += `Temperature: ${status.processes.stats.gpu.temperature}°C<br>`;
            }
            html += '</div>';
            
            // CPU stats
            html += '<div>';
            html += '<strong>CPU:</strong><br>';
            html += `Status: ${status.processes.isRunning.cpu ? '✅ Running' : '⏸️ Stopped'}<br>`;
            if (status.processes.stats.cpu.hashrate > 0) {
                html += `Hashrate: ${status.processes.stats.cpu.hashrate.toFixed(2)} H/s<br>`;
            }
            html += '</div>';
            
            html += '</div>';
            statsDisplay.innerHTML = html;
        }
    }

    /**
     * Toggle advanced technical details
     */
    window.toggleAdvancedTechnical = function() {
        const content = document.getElementById('advancedTechnicalContent');
        const arrow = document.getElementById('advancedTechnicalArrow');
        
        if (content.classList.contains('open')) {
            content.classList.remove('open');
            arrow.textContent = '▼';
        } else {
            content.classList.add('open');
            arrow.textContent = '▲';
        }
    };

    /**
     * Show notification
     */
    function showNotification(message, type = 'info') {
        // Simple notification using alert for now
        // In production, use a toast library
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Create a simple toast
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 2rem;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 0.5rem;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

})();
