/**
 * Navigation & Sidebar Management
 * Pup Cid's Little TikTok Helper
 */

(() => {
    'use strict';

    // ========== STATE ==========
    let currentView = 'dashboard';
    let sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        // Initialize UI immediately for better responsiveness
        initializeSidebar();
        initializeNavigation();
        initializeShortcuts();

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Register i18n language change listener to update connection status
        if (window.i18n) {
            window.i18n.onLanguageChange((newLocale) => {
                // Get current connection status from the badge
                const statusBadge = document.getElementById('connection-status');
                if (statusBadge) {
                    let currentStatus = 'disconnected';
                    if (statusBadge.classList.contains('status-connected')) {
                        currentStatus = 'connected';
                    } else if (statusBadge.classList.contains('status-error')) {
                        currentStatus = 'error';
                    }
                    // Re-update the status with new language
                    updateConnectionStatus(currentStatus);
                }
            });
        }

        // Load plugin visibility asynchronously (non-blocking)
        // This prevents the dashboard from appearing unresponsive
        initializePluginVisibilityAsync();
    });

    // Async wrapper for plugin visibility initialization
    async function initializePluginVisibilityAsync() {
        // Wait for server to be fully initialized before loading plugins
        if (window.initHelper) {
            try {
                console.log('⏳ [Navigation] Waiting for server initialization...');
                await window.initHelper.waitForReady(10000);
                console.log('✅ [Navigation] Server ready, loading plugin visibility...');
            } catch (err) {
                console.warn('[Navigation] Server initialization check timed out, proceeding anyway:', err);
            }
        }

        // Load plugin visibility
        await initializePluginVisibility();
        
        // Listen for plugin changes via socket (if socket is available)
        setupPluginChangeListener();
    }

    // Setup socket listener for plugin changes
    function setupPluginChangeListener() {
        // Wait for socket to be available (dashboard.js creates it)
        const checkSocket = setInterval(() => {
            if (typeof socket !== 'undefined' && socket) {
                clearInterval(checkSocket);
                
                socket.on('plugins:changed', (data) => {
                    console.log('🔌 [Navigation] Plugin state changed:', data);
                    // Refresh plugin visibility without full page reload
                    initializePluginVisibility();
                });
                
                console.log('✅ [Navigation] Plugin change listener registered');
            }
        }, 100);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkSocket), 10000);
    }

    // ========== SIDEBAR MANAGEMENT ==========
    function initializeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle');

        if (!sidebar) {
            console.warn('Sidebar element not found');
            return;
        }

        // Apply saved state
        if (sidebarCollapsed) {
            sidebar.classList.add('sidebar-collapsed');
        }

        // Toggle button
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                sidebarCollapsed = !sidebarCollapsed;
                sidebar.classList.toggle('sidebar-collapsed');
                localStorage.setItem('sidebar-collapsed', sidebarCollapsed);

                // Re-initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        }

        // Mobile: Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                const clickedInsideSidebar = sidebar.contains(e.target);
                const clickedToggle = toggleBtn && toggleBtn.contains(e.target);

                if (!clickedInsideSidebar && !clickedToggle && sidebar.classList.contains('mobile-open')) {
                    sidebar.classList.remove('mobile-open');
                }
            }
        });
    }

    // ========== NAVIGATION ==========
    function initializeNavigation() {
        const navItems = document.querySelectorAll('.sidebar-item[data-view]');

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = item.getAttribute('data-view');
                switchView(viewName);
            });
        });

        // Topbar settings button
        const topbarSettingsBtn = document.getElementById('topbar-settings-btn');
        if (topbarSettingsBtn) {
            topbarSettingsBtn.addEventListener('click', () => {
                switchView('settings');
            });
        }

        // Check for hash-based navigation first (e.g., #soundboard)
        const hash = window.location.hash.substring(1); // Remove the #
        if (hash) {
            const viewElement = document.getElementById(`view-${hash}`);
            if (viewElement) {
                switchView(hash);
                return;
            }
        }
        
        // Restore last view or default to dashboard
        const savedView = localStorage.getItem('active-view');
        if (savedView) {
            // Check if view exists and is visible
            const viewElement = document.getElementById(`view-${savedView}`);
            if (viewElement && viewElement.style.display !== 'none') {
                switchView(savedView);
            } else {
                switchView('dashboard');
            }
        }
    }

    function switchView(viewName) {
        // Check if the requested view exists and is not hidden (disabled plugin)
        const requestedView = document.getElementById(`view-${viewName}`);
        if (!requestedView || requestedView.style.display === 'none') {
            console.warn(`Cannot switch to view "${viewName}" - view is hidden or does not exist. Redirecting to dashboard.`);
            // Redirect to dashboard if view is hidden or doesn't exist
            if (viewName !== 'dashboard') {
                switchView('dashboard');
                return;
            }
        }

        // Update active nav item
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeNavItem = document.querySelector(`.sidebar-item[data-view="${viewName}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        // Update active view
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });

        const activeView = document.getElementById(`view-${viewName}`);
        if (activeView) {
            activeView.classList.add('active');
        }

        // Save current view
        currentView = viewName;
        localStorage.setItem('active-view', viewName);

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Trigger view-specific initialization
        handleViewChange(viewName);

        // Close mobile sidebar after navigation
        if (window.innerWidth <= 1024) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('mobile-open');
            }
        }
    }

    function handleViewChange(viewName) {
        // View-specific logic
        switch (viewName) {
            case 'dashboard':
                initializeDashboardResources();
                break;
            case 'events':
                // Events are handled by dashboard.js
                break;
            case 'flows':
                if (typeof loadFlows === 'function') {
                    loadFlows();
                }
                break;
            case 'plugins':
                if (window.pluginManager && typeof window.pluginManager.loadPlugins === 'function') {
                    window.pluginManager.loadPlugins();
                }
                break;
            case 'soundboard':
                if (typeof loadSoundboardSettings === 'function') {
                    loadSoundboardSettings();
                    loadGiftSounds();
                    loadGiftCatalog();
                }
                break;
            case 'settings':
                if (typeof loadAutoStartSettings === 'function') {
                    loadAutoStartSettings();
                }
                if (typeof loadResourceMonitorSettings === 'function') {
                    loadResourceMonitorSettings();
                }
                if (typeof loadOSCBridgeSettings === 'function') {
                    loadOSCBridgeSettings();
                }
                break;
        }
    }

    // ========== DASHBOARD SHORTCUTS ==========
    function initializeShortcuts() {
        const shortcutsGrid = document.getElementById('shortcuts-grid');
        if (!shortcutsGrid) return;

        // Define shortcuts
        const shortcuts = [
            { icon: 'activity', label: 'Events', view: 'events' },
            { icon: 'git-branch', label: 'Flows', view: 'flows' },
            { icon: 'target', label: 'Goals', view: 'goals', plugin: 'goals' },
            { icon: 'eye', label: 'LastEvent', view: 'lastevent-spotlight', plugin: 'lastevent-spotlight' },
            { icon: 'mic', label: 'TTS', view: 'tts', plugin: 'tts' },
            { icon: 'music', label: 'Soundboard', view: 'soundboard', plugin: 'soundboard' },
            { icon: 'cloud-rain', label: 'Emoji Rain', view: 'emoji-rain', plugin: 'emoji-rain' },
            { icon: 'users', label: 'Multi-Guest', view: 'multi-guest', plugin: 'vdoninja' },
            { icon: 'gift', label: 'Gift Milestone', view: 'gift-milestone', plugin: 'gift-milestone' },
            { icon: 'video', label: 'Multi-Cam', view: 'multicam', plugin: 'multicam' },
            { icon: 'gamepad-2', label: 'OSC-Bridge', view: 'osc-bridge', plugin: 'osc-bridge' },
            { icon: 'zap', label: 'HybridShock', view: 'hybridshock', plugin: 'hybridshock' },
            { icon: 'zap', label: 'OpenShock', view: 'openshock', plugin: 'openshock' },
            { icon: 'help-circle', label: 'Quiz Show', view: 'quiz-show', plugin: 'quiz-show' },
            { icon: 'award', label: 'Viewer XP', view: 'viewer-xp', plugin: 'viewer-xp' },
            { icon: 'cpu', label: 'Resources', view: 'resource-monitor', plugin: 'resource-monitor' },
            { icon: 'plug', label: 'Plugins', view: 'plugins' },
            { icon: 'settings', label: 'Settings', view: 'settings' }
        ];

        // Render shortcuts
        shortcuts.forEach(shortcut => {
            const card = document.createElement('a');
            card.href = '#';
            card.className = 'shortcut-card';
            card.setAttribute('data-view', shortcut.view);
            if (shortcut.plugin) {
                card.setAttribute('data-plugin', shortcut.plugin);
            }

            card.innerHTML = `
                <div class="shortcut-icon">
                    <i data-lucide="${shortcut.icon}"></i>
                </div>
                <div class="shortcut-label">${shortcut.label}</div>
            `;

            card.addEventListener('click', (e) => {
                e.preventDefault();
                switchView(shortcut.view);
            });

            shortcutsGrid.appendChild(card);
        });

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== DASHBOARD RESOURCES MONITOR ==========
    function initializeDashboardResources() {
        // This is a simplified resource monitor for the dashboard
        // The full resource monitor is in the resource-monitor plugin

        // Mock data for now (will be replaced by actual resource monitoring)
        setInterval(() => {
            const cpuUsage = Math.random() * 10; // 0-10%
            const ramUsage = 30 + Math.random() * 20; // 30-50%
            const fps = 60;
            const latency = Math.floor(20 + Math.random() * 30); // 20-50ms

            // Update CPU
            const cpuElement = document.getElementById('resource-cpu');
            const cpuBar = document.getElementById('resource-cpu-bar');
            if (cpuElement && cpuBar) {
                cpuElement.textContent = cpuUsage.toFixed(1) + '%';
                cpuBar.style.width = cpuUsage + '%';

                // Color based on threshold
                if (cpuUsage > 8) {
                    cpuBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
                } else if (cpuUsage > 5) {
                    cpuBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
                } else {
                    cpuBar.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)';
                }
            }

            // Update RAM
            const ramElement = document.getElementById('resource-ram');
            const ramBar = document.getElementById('resource-ram-bar');
            if (ramElement && ramBar) {
                ramElement.textContent = ramUsage.toFixed(1) + '%';
                ramBar.style.width = ramUsage + '%';
            }

            // Update FPS
            const fpsElement = document.getElementById('resource-fps');
            if (fpsElement) {
                fpsElement.textContent = fps;
            }

            // Update Latency
            const latencyElement = document.getElementById('resource-latency');
            if (latencyElement) {
                latencyElement.textContent = latency + 'ms';
            }
        }, 1000);
    }

    // ========== QUICK ACTIONS ==========
    // NOTE: Quick Actions are now handled by dashboard-enhancements.js
    // Old toggle-based implementation has been removed

    // ========== PLUGIN VISIBILITY ==========
    async function initializePluginVisibility(retryCount = 0, maxRetries = 3) {
        try {
            // Load plugin list from server
            const response = await fetch('/api/plugins');
            if (!response.ok) {
                // Retry if server isn't ready yet
                if (retryCount < maxRetries) {
                    console.log(`Plugin API not ready, retrying... (${retryCount + 1}/${maxRetries})`);
                    setTimeout(() => {
                        initializePluginVisibility(retryCount + 1, maxRetries);
                    }, 500 * (retryCount + 1)); // Faster retry: 500ms, 1s, 1.5s
                    return;
                }
                console.warn('Failed to load plugins for visibility check after retries');
                return;
            }

            const data = await response.json();
            if (!data.success) {
                console.warn('Plugin API returned unsuccessful response');
                return;
            }

            // Create set of active plugin IDs
            const activePlugins = new Set(
                data.plugins
                    .filter(p => p.enabled)
                    .map(p => p.id)
            );

            console.log('✅ [Navigation] Active plugins loaded:', Array.from(activePlugins));

            // Hide sidebar items, shortcuts, AND views for inactive plugins
            const pluginElements = document.querySelectorAll('[data-plugin]');
            pluginElements.forEach(element => {
                const requiredPlugin = element.getAttribute('data-plugin');

                if (!activePlugins.has(requiredPlugin)) {
                    element.style.display = 'none';
                    console.log(`Hiding element for inactive plugin: ${requiredPlugin}`);
                } else {
                    element.style.display = '';
                }
            });

            // Re-initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

        } catch (error) {
            // Retry on network errors
            if (retryCount < maxRetries) {
                console.log(`Error loading plugins, retrying... (${retryCount + 1}/${maxRetries})`);
                setTimeout(() => {
                    initializePluginVisibility(retryCount + 1, maxRetries);
                }, 500 * (retryCount + 1)); // Faster retry: 500ms, 1s, 1.5s
                return;
            }
            console.error('Error checking plugin visibility after retries:', error);
        }
    }

    // Export for use in other modules
    window.NavigationManager = {
        switchView,
        refreshPluginVisibility: initializePluginVisibility
    };

    // ========== CONNECTION STATUS UPDATES ==========
    function updateConnectionStatus(status, data = {}) {
        const statusBadge = document.getElementById('connection-status');
        if (!statusBadge) return;

        const statusIcon = statusBadge.querySelector('[data-lucide]');
        const statusText = statusBadge.querySelector('span');

        // Remove all status classes
        statusBadge.classList.remove('status-connected', 'status-disconnected', 'status-error');

        // Helper function to get translated text
        const getTranslation = (key, fallback) => {
            return (window.i18n && window.i18n.initialized) ? window.i18n.t(key) : fallback;
        };

        switch (status) {
            case 'connected':
                statusBadge.classList.add('status-connected');
                if (statusIcon) statusIcon.setAttribute('data-lucide', 'check-circle');
                if (statusText) {
                    statusText.setAttribute('data-i18n', 'dashboard.connected');
                    statusText.textContent = getTranslation('dashboard.connected', 'Connected');
                }
                break;

            case 'disconnected':
                statusBadge.classList.add('status-disconnected');
                if (statusIcon) statusIcon.setAttribute('data-lucide', 'circle');
                if (statusText) {
                    statusText.setAttribute('data-i18n', 'dashboard.disconnected');
                    statusText.textContent = getTranslation('dashboard.disconnected', 'Disconnected');
                }
                break;

            case 'error':
            case 'retrying':
                statusBadge.classList.add('status-error');
                if (statusIcon) statusIcon.setAttribute('data-lucide', 'alert-circle');
                if (statusText) {
                    if (status === 'retrying') {
                        statusText.setAttribute('data-i18n', 'dashboard.retrying');
                        statusText.textContent = `${getTranslation('dashboard.retrying', 'Retrying')} (${data.attempt}/${data.maxRetries})`;
                    } else {
                        statusText.setAttribute('data-i18n', 'common.error');
                        statusText.textContent = getTranslation('common.error', 'Error');
                    }
                }
                break;
        }

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // ========== MOBILE MENU TOGGLE ==========
    function initializeMobileMenu() {
        // Add a mobile menu button if needed
        const topbar = document.querySelector('.topbar-left');
        if (!topbar || window.innerWidth > 1024) return;

        const menuBtn = document.createElement('button');
        menuBtn.className = 'topbar-icon-btn';
        menuBtn.id = 'mobile-menu-btn';
        menuBtn.innerHTML = '<i data-lucide="menu"></i>';
        menuBtn.style.marginRight = '1rem';

        menuBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('mobile-open');
        });

        topbar.insertBefore(menuBtn, topbar.firstChild);

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.remove('mobile-open');

            // Remove mobile menu button if exists
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            if (mobileMenuBtn) {
                mobileMenuBtn.remove();
            }
        } else {
            initializeMobileMenu();
        }
    });

    // Initialize mobile menu on load if needed
    if (window.innerWidth <= 1024) {
        initializeMobileMenu();
    }

    // ========== EXPORTS (for use in dashboard.js) ==========
    window.NavigationManager = {
        switchView,
        updateConnectionStatus,
        getCurrentView: () => currentView,
        refreshPluginVisibility: initializePluginVisibility
    };

})();
