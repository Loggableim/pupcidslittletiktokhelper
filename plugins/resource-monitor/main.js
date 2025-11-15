const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const MetricsCollector = require('./utils/metrics-collector');

/**
 * Resource Monitor Plugin
 *
 * Real-time system resource monitoring with:
 * - CPU usage (total and per-core)
 * - CPU temperature (if available)
 * - RAM usage (total, used, free, percentage)
 * - Process-specific memory usage
 * - GPU information and usage (if available)
 * - System uptime and process uptime
 * - Historical data tracking (last 60 seconds)
 *
 * Features:
 * - Real-time metrics broadcasting via Socket.IO
 * - HTTP REST API for current metrics
 * - Configurable update interval
 * - Configurable threshold warnings
 * - Cross-platform support (Windows, macOS, Linux)
 * - Graceful error handling (won't crash on missing GPU)
 */
class ResourceMonitorPlugin extends EventEmitter {
    constructor(api) {
        super();
        this.api = api;

        // Metrics collector instance
        this.metricsCollector = null;

        // Update interval (milliseconds)
        this.updateInterval = 2000; // 2 seconds default
        this.updateTimer = null;

        // Threshold settings for warnings
        this.thresholds = {
            cpu: {
                warning: 80,  // Warn at 80% CPU usage
                critical: 95  // Critical at 95% CPU usage
            },
            memory: {
                warning: 80,  // Warn at 80% memory usage
                critical: 95  // Critical at 95% memory usage
            },
            temperature: {
                warning: 75,  // Warn at 75°C
                critical: 85  // Critical at 85°C
            }
        };

        // Connected clients counter
        this.subscribedClients = 0;

        // Plugin state
        this.isRunning = false;
    }

    /**
     * Initialize the plugin
     */
    async init() {
        this.api.log('Initializing Resource Monitor Plugin...', 'info');

        try {
            // Initialize metrics collector
            this.metricsCollector = new MetricsCollector((message, level) => {
                this.api.log(message, level);
            });

            await this.metricsCollector.initialize();

            // Register HTTP routes
            this.registerRoutes();

            // Register Socket.IO handlers
            this.registerSocketHandlers();

            // Load settings from database (if exists)
            await this.loadSettings();

            // Start metrics collection
            this.startMetricsCollection();

            this.isRunning = true;

            this.api.log('✅ Resource Monitor Plugin initialized', 'info');

        } catch (error) {
            this.api.log(`Error initializing Resource Monitor Plugin: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load settings from database or use defaults
     */
    async loadSettings() {
        try {
            const db = this.api.getDatabase();

            // Check if settings table exists
            const tableCheck = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='resource_monitor_settings'
            `).get();

            if (!tableCheck) {
                // Create settings table
                db.exec(`
                    CREATE TABLE IF NOT EXISTS resource_monitor_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        description TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Insert default settings
                const stmt = db.prepare(`
                    INSERT OR IGNORE INTO resource_monitor_settings (key, value, description)
                    VALUES (?, ?, ?)
                `);

                stmt.run('update_interval', '2000', 'Metrics update interval in milliseconds');
                stmt.run('cpu_warning_threshold', '80', 'CPU usage warning threshold (%)');
                stmt.run('cpu_critical_threshold', '95', 'CPU usage critical threshold (%)');
                stmt.run('memory_warning_threshold', '80', 'Memory usage warning threshold (%)');
                stmt.run('memory_critical_threshold', '95', 'Memory usage critical threshold (%)');
                stmt.run('temp_warning_threshold', '75', 'Temperature warning threshold (°C)');
                stmt.run('temp_critical_threshold', '85', 'Temperature critical threshold (°C)');

                this.api.log('✅ Resource Monitor settings table created', 'info');
            }

            // Load settings
            const settings = db.prepare('SELECT * FROM resource_monitor_settings').all();

            settings.forEach(setting => {
                const value = parseInt(setting.value);

                switch (setting.key) {
                    case 'update_interval':
                        this.updateInterval = Math.max(500, value); // Min 500ms
                        break;
                    case 'cpu_warning_threshold':
                        this.thresholds.cpu.warning = value;
                        break;
                    case 'cpu_critical_threshold':
                        this.thresholds.cpu.critical = value;
                        break;
                    case 'memory_warning_threshold':
                        this.thresholds.memory.warning = value;
                        break;
                    case 'memory_critical_threshold':
                        this.thresholds.memory.critical = value;
                        break;
                    case 'temp_warning_threshold':
                        this.thresholds.temperature.warning = value;
                        break;
                    case 'temp_critical_threshold':
                        this.thresholds.temperature.critical = value;
                        break;
                }
            });

            this.api.log(`Settings loaded: interval=${this.updateInterval}ms`, 'info');

        } catch (error) {
            this.api.log(`Error loading settings: ${error.message}`, 'warn');
            // Use defaults
        }
    }

    /**
     * Start metrics collection loop
     */
    startMetricsCollection() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        this.api.log(`Starting metrics collection (interval: ${this.updateInterval}ms)`, 'info');

        // Collect immediately
        this.collectAndBroadcast();

        // Then collect at intervals
        this.updateTimer = setInterval(() => {
            this.collectAndBroadcast();
        }, this.updateInterval);
    }

    /**
     * Stop metrics collection loop
     */
    stopMetricsCollection() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
            this.api.log('Metrics collection stopped', 'info');
        }
    }

    /**
     * Collect metrics and broadcast to subscribed clients
     */
    async collectAndBroadcast() {
        try {
            // Only collect if we have subscribers (optimization)
            if (this.subscribedClients === 0) {
                return;
            }

            if (!this.metricsCollector) {
                this.api.log('Metrics collector not initialized, skipping collection', 'warn');
                return;
            }

            const metrics = await this.metricsCollector.collectMetrics();

            if (!metrics) {
                return;
            }

            // Check thresholds and emit warnings
            this.checkThresholds(metrics);

            // Broadcast to all subscribed clients
            this.api.emit('resource-monitor:metrics', metrics);

        } catch (error) {
            this.api.log(`Error collecting/broadcasting metrics: ${error.message}`, 'error');
        }
    }

    /**
     * Check thresholds and emit warnings
     */
    checkThresholds(metrics) {
        try {
            const warnings = [];

            // Check CPU usage
            if (metrics.cpu.usage >= this.thresholds.cpu.critical) {
                warnings.push({
                    type: 'cpu',
                    level: 'critical',
                    message: `CPU usage critical: ${metrics.cpu.usage.toFixed(1)}%`,
                    value: metrics.cpu.usage,
                    threshold: this.thresholds.cpu.critical
                });
            } else if (metrics.cpu.usage >= this.thresholds.cpu.warning) {
                warnings.push({
                    type: 'cpu',
                    level: 'warning',
                    message: `CPU usage high: ${metrics.cpu.usage.toFixed(1)}%`,
                    value: metrics.cpu.usage,
                    threshold: this.thresholds.cpu.warning
                });
            }

            // Check memory usage
            if (metrics.memory.usedPercent >= this.thresholds.memory.critical) {
                warnings.push({
                    type: 'memory',
                    level: 'critical',
                    message: `Memory usage critical: ${metrics.memory.usedPercent.toFixed(1)}%`,
                    value: metrics.memory.usedPercent,
                    threshold: this.thresholds.memory.critical
                });
            } else if (metrics.memory.usedPercent >= this.thresholds.memory.warning) {
                warnings.push({
                    type: 'memory',
                    level: 'warning',
                    message: `Memory usage high: ${metrics.memory.usedPercent.toFixed(1)}%`,
                    value: metrics.memory.usedPercent,
                    threshold: this.thresholds.memory.warning
                });
            }

            // Check CPU temperature (if available)
            if (metrics.cpu.temperature && metrics.cpu.temperature.main !== null) {
                const temp = metrics.cpu.temperature.main;
                if (temp >= this.thresholds.temperature.critical) {
                    warnings.push({
                        type: 'temperature',
                        level: 'critical',
                        message: `CPU temperature critical: ${temp}°C`,
                        value: temp,
                        threshold: this.thresholds.temperature.critical
                    });
                } else if (temp >= this.thresholds.temperature.warning) {
                    warnings.push({
                        type: 'temperature',
                        level: 'warning',
                        message: `CPU temperature high: ${temp}°C`,
                        value: temp,
                        threshold: this.thresholds.temperature.warning
                    });
                }
            }

            // Emit warnings if any
            if (warnings.length > 0) {
                this.api.emit('resource-monitor:warnings', {
                    timestamp: Date.now(),
                    warnings
                });

                // Log critical warnings
                warnings.forEach(warning => {
                    if (warning.level === 'critical') {
                        this.api.log(warning.message, 'warn');
                    }
                });
            }

        } catch (error) {
            this.api.log(`Error checking thresholds: ${error.message}`, 'error');
        }
    }

    /**
     * Register HTTP routes
     */
    registerRoutes() {
        // Serve UI HTML
        this.api.registerRoute('get', '/resource-monitor/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui.html');
            if (fs.existsSync(uiPath)) {
                res.sendFile(uiPath);
            } else {
                res.status(404).json({
                    success: false,
                    error: 'UI not found. Create ui.html for the Resource Monitor interface.'
                });
            }
        });

        // Serve UI JavaScript with correct MIME type
        this.api.registerRoute('get', '/resource-monitor/ui.js', (req, res) => {
            const jsPath = path.join(__dirname, 'ui.js');
            if (fs.existsSync(jsPath)) {
                res.setHeader('Content-Type', 'application/javascript');
                res.sendFile(jsPath);
            } else {
                res.status(404).json({
                    success: false,
                    error: 'UI JavaScript not found.'
                });
            }
        });

        // Get current metrics
        this.api.registerRoute('get', '/api/resource-monitor/metrics', async (req, res) => {
            try {
                if (!this.metricsCollector) {
                    return res.status(503).json({
                        success: false,
                        error: 'Metrics collector not initialized'
                    });
                }

                const metrics = await this.metricsCollector.collectMetrics();

                if (!metrics) {
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to collect metrics'
                    });
                }

                res.json({
                    success: true,
                    metrics
                });

            } catch (error) {
                this.api.log(`Error in /api/resource-monitor/metrics: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get historical data
        this.api.registerRoute('get', '/api/resource-monitor/history', (req, res) => {
            try {
                if (!this.metricsCollector) {
                    return res.status(503).json({
                        success: false,
                        error: 'Metrics collector not initialized'
                    });
                }

                const history = this.metricsCollector.getHistory();

                res.json({
                    success: true,
                    history
                });

            } catch (error) {
                this.api.log(`Error in /api/resource-monitor/history: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get plugin status
        this.api.registerRoute('get', '/api/resource-monitor/status', (req, res) => {
            res.json({
                success: true,
                status: {
                    running: this.isRunning,
                    updateInterval: this.updateInterval,
                    subscribedClients: this.subscribedClients,
                    hasGPU: this.metricsCollector ? this.metricsCollector.hasGPU : false,
                    thresholds: this.thresholds
                }
            });
        });

        // Update settings
        this.api.registerRoute('post', '/api/resource-monitor/settings', async (req, res) => {
            try {
                const { updateInterval, thresholds } = req.body;

                const db = this.api.getDatabase();

                // Update interval
                if (updateInterval !== undefined) {
                    const newInterval = Math.max(500, parseInt(updateInterval));
                    this.updateInterval = newInterval;

                    const stmt = db.prepare(`
                        UPDATE resource_monitor_settings
                        SET value = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE key = 'update_interval'
                    `);
                    stmt.run(newInterval.toString());

                    // Restart collection with new interval
                    this.startMetricsCollection();
                }

                // Update thresholds
                if (thresholds) {
                    const thresholdUpdates = {
                        'cpu_warning_threshold': thresholds.cpu?.warning,
                        'cpu_critical_threshold': thresholds.cpu?.critical,
                        'memory_warning_threshold': thresholds.memory?.warning,
                        'memory_critical_threshold': thresholds.memory?.critical,
                        'temp_warning_threshold': thresholds.temperature?.warning,
                        'temp_critical_threshold': thresholds.temperature?.critical
                    };

                    const stmt = db.prepare(`
                        UPDATE resource_monitor_settings
                        SET value = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE key = ?
                    `);

                    for (const [key, value] of Object.entries(thresholdUpdates)) {
                        if (value !== undefined) {
                            stmt.run(value.toString(), key);
                        }
                    }

                    // Reload settings
                    await this.loadSettings();
                }

                res.json({
                    success: true,
                    message: 'Settings updated',
                    settings: {
                        updateInterval: this.updateInterval,
                        thresholds: this.thresholds
                    }
                });

            } catch (error) {
                this.api.log(`Error updating settings: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Clear historical data
        this.api.registerRoute('post', '/api/resource-monitor/clear-history', (req, res) => {
            try {
                if (!this.metricsCollector) {
                    return res.status(503).json({
                        success: false,
                        error: 'Metrics collector not initialized'
                    });
                }

                this.metricsCollector.clearHistory();

                res.json({
                    success: true,
                    message: 'History cleared'
                });

            } catch (error) {
                this.api.log(`Error clearing history: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.log('✅ HTTP routes registered', 'info');
    }

    /**
     * Register Socket.IO handlers
     */
    registerSocketHandlers() {
        // Client subscribes to metrics updates
        this.api.registerSocket('resource-monitor:subscribe', (socket) => {
            this.subscribedClients++;
            this.api.log(`Client subscribed to metrics (total: ${this.subscribedClients})`, 'info');

            // Send current metrics immediately
            if (this.metricsCollector) {
                this.metricsCollector.collectMetrics().then(metrics => {
                    if (metrics) {
                        socket.emit('resource-monitor:metrics', metrics);
                    }
                }).catch(error => {
                    this.api.log(`Error sending initial metrics: ${error.message}`, 'error');
                    socket.emit('resource-monitor:error', {
                        error: error.message
                    });
                });
            } else {
                socket.emit('resource-monitor:error', {
                    error: 'Metrics collector not initialized'
                });
            }

            // Handle disconnect
            socket.on('disconnect', () => {
                this.subscribedClients = Math.max(0, this.subscribedClients - 1);
                this.api.log(`Client unsubscribed from metrics (total: ${this.subscribedClients})`, 'info');
            });
        });

        // Client requests current metrics (one-time)
        this.api.registerSocket('resource-monitor:get-metrics', async (socket) => {
            try {
                if (!this.metricsCollector) {
                    socket.emit('resource-monitor:error', {
                        error: 'Metrics collector not initialized'
                    });
                    return;
                }

                const metrics = await this.metricsCollector.collectMetrics();

                if (metrics) {
                    socket.emit('resource-monitor:metrics', metrics);
                }
            } catch (error) {
                this.api.log(`Error sending metrics: ${error.message}`, 'error');
                socket.emit('resource-monitor:error', {
                    error: error.message
                });
            }
        });

        // Client requests historical data
        this.api.registerSocket('resource-monitor:get-history', (socket) => {
            try {
                if (!this.metricsCollector) {
                    socket.emit('resource-monitor:error', {
                        error: 'Metrics collector not initialized'
                    });
                    return;
                }

                const history = this.metricsCollector.getHistory();
                socket.emit('resource-monitor:history', history);
            } catch (error) {
                this.api.log(`Error sending history: ${error.message}`, 'error');
                socket.emit('resource-monitor:error', {
                    error: error.message
                });
            }
        });

        this.api.log('✅ Socket.IO handlers registered', 'info');
    }

    /**
     * Cleanup on plugin destruction
     */
    async destroy() {
        this.api.log('Resource Monitor Plugin shutting down...', 'info');

        // Stop metrics collection
        this.stopMetricsCollection();

        // Clear metrics collector
        if (this.metricsCollector) {
            this.metricsCollector.clearHistory();
            this.metricsCollector = null;
        }

        this.isRunning = false;

        this.api.log('✅ Resource Monitor Plugin destroyed', 'info');
    }
}

module.exports = ResourceMonitorPlugin;
