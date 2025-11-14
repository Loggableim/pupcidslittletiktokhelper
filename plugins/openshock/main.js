/**
 * OpenShock Integration Plugin - Main Class
 *
 * Vollständige OpenShock API-Integration für TikTok Live Events
 *
 * Features:
 * - OpenShock API Integration (Shock, Vibrate, Sound)
 * - Event-Mapping-System (TikTok Events → OpenShock Actions)
 * - Pattern Engine (8 Preset-Patterns + Custom Patterns)
 * - Safety Layer (Multi-Level Limits & Emergency Stop)
 * - Queue System (Priority, Retry, Load-Balancing)
 * - Real-time Dashboard & Overlay
 * - Import/Export von Mappings & Patterns
 *
 * @version 1.0.0
 * @author pupcidslittletiktokhelper Team
 */

const path = require('path');
const fs = require('fs').promises;

// Helper-Klassen
const OpenShockClient = require('./helpers/openShockClient');
const MappingEngine = require('./helpers/mappingEngine');
const PatternEngine = require('./helpers/patternEngine');
const SafetyManager = require('./helpers/safetyManager');
const QueueManager = require('./helpers/queueManager');

class OpenShockPlugin {
    constructor(api) {
        this.api = api;

        // Configuration (wird in init() geladen)
        this.config = {
            apiKey: '',
            baseUrl: 'https://api.openshock.app',
            globalLimits: {
                maxIntensity: 80,
                maxDuration: 5000,
                maxCommandsPerMinute: 30
            },
            defaultCooldowns: {
                global: 5000,
                perDevice: 3000,
                perUser: 10000
            },
            userLimits: {
                minFollowerAge: 7,
                maxCommandsPerUser: 10
            },
            queueSettings: {
                maxQueueSize: 1000,
                processingDelay: 300
            },
            emergencyStop: {
                enabled: false
            },
            overlay: {
                enabled: true,
                showDevice: true,
                showIntensity: true,
                showPattern: true,
                animationDuration: 2000
            }
        };

        // Helper-Instanzen (werden in init() initialisiert)
        this.openShockClient = null;
        this.mappingEngine = null;
        this.patternEngine = null;
        this.safetyManager = null;
        this.queueManager = null;

        // State
        this.devices = [];
        this.isRunning = false;
        this.isPaused = false;

        // Statistics
        this.stats = {
            startTime: null,
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            queuedCommands: 0,
            blockedCommands: 0,
            emergencyStops: 0,
            tiktokEventsProcessed: 0,
            patternsExecuted: 0,
            lastCommandTime: null,
            errors: []
        };

        // Pattern-Execution Tracking
        this.activePatternExecutions = new Map();

        // Log-Buffer für Frontend
        this.eventLog = [];
        this.maxEventLog = 500;
    }

    /**
     * Plugin initialisieren
     */
    async init() {
        try {
            this.api.log('OpenShock Plugin initializing...', 'info');

            // 1. Datenbank initialisieren
            this._initializeDatabase();

            // 2. Config laden
            await this.loadData();

            // 3. Helper initialisieren
            this._initializeHelpers();

            // 4. Routes registrieren
            this._registerRoutes();

            // 5. Socket.IO Events registrieren
            this._registerSocketEvents();

            // 6. TikTok Events registrieren
            this._registerTikTokEvents();

            // 7. Devices laden (wenn API Key vorhanden)
            if (this.config.apiKey && this.config.apiKey.trim() !== '') {
                try {
                    await this.loadDevices();
                } catch (error) {
                    this.api.log(`Failed to load devices on init: ${error.message}`, 'warn');
                }
            }

            // 8. Queue starten
            if (this.queueManager) {
                this.queueManager.startProcessing();
            }

            // 9. Stats-Timer starten
            this._startStatsTimer();

            this.isRunning = true;
            this.stats.startTime = Date.now();

            this.api.log('OpenShock Plugin initialized successfully', 'info');

            // Initial status broadcast
            this._broadcastStatus();

            return true;

        } catch (error) {
            this.api.log(`Failed to initialize OpenShock Plugin: ${error.message}`, 'error');
            console.error(error);
            throw error;
        }
    }

    /**
     * Datenbank-Tabellen erstellen
     */
    _initializeDatabase() {
        const db = this.api.getDatabase();

        // Config-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Mappings-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                enabled INTEGER DEFAULT 1,
                event_type TEXT NOT NULL,
                conditions TEXT,
                action TEXT NOT NULL,
                priority INTEGER DEFAULT 5,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Patterns-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                steps TEXT NOT NULL,
                preset INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Event-Log-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                event_source TEXT NOT NULL,
                user_id TEXT,
                username TEXT,
                action_taken TEXT,
                success INTEGER,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Command-History-Tabelle
        db.exec(`
            CREATE TABLE IF NOT EXISTS openshock_command_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                device_name TEXT,
                command_type TEXT NOT NULL,
                intensity INTEGER,
                duration INTEGER,
                user_id TEXT,
                username TEXT,
                source TEXT,
                success INTEGER,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.api.log('OpenShock database tables initialized', 'info');
    }

    /**
     * Helper-Klassen initialisieren
     */
    _initializeHelpers() {
        // OpenShock API Client
        this.openShockClient = new OpenShockClient({
            apiKey: this.config.apiKey,
            baseUrl: this.config.baseUrl
        });

        // Mapping Engine
        this.mappingEngine = new MappingEngine({
            database: this.api.getDatabase(),
            logger: this.api.log.bind(this.api)
        });

        // Pattern Engine
        this.patternEngine = new PatternEngine({
            database: this.api.getDatabase(),
            logger: this.api.log.bind(this.api)
        });

        // Safety Manager
        this.safetyManager = new SafetyManager({
            globalLimits: this.config.globalLimits,
            defaultCooldowns: this.config.defaultCooldowns,
            userLimits: this.config.userLimits,
            emergencyStop: this.config.emergencyStop,
            logger: this.api.log.bind(this.api)
        });

        // Queue Manager
        this.queueManager = new QueueManager({
            maxQueueSize: this.config.queueSettings.maxQueueSize,
            processingDelay: this.config.queueSettings.processingDelay,
            processCallback: this._processQueueItem.bind(this),
            logger: this.api.log.bind(this.api)
        });

        // Queue Event-Handler
        this.queueManager.on('item-processed', (item, success) => {
            this._broadcastQueueUpdate();
            if (success) {
                this.stats.successfulCommands++;
            } else {
                this.stats.failedCommands++;
            }
        });

        this.queueManager.on('queue-changed', () => {
            this._broadcastQueueUpdate();
        });

        this.api.log('OpenShock helpers initialized', 'info');
    }

    /**
     * Routes registrieren (UI + API)
     */
    _registerRoutes() {
        const app = this.api.getApp();
        const pluginDir = __dirname;

        // ============ UI ROUTES ============

        // Main UI
        app.get('/openshock/ui', (req, res) => {
            res.sendFile(path.join(pluginDir, 'openshock.html'));
        });

        // Overlay
        app.get('/openshock/overlay', (req, res) => {
            res.sendFile(path.join(pluginDir, 'overlay', 'openshock_overlay.html'));
        });

        // CSS
        app.get('/openshock/openshock.css', (req, res) => {
            res.sendFile(path.join(pluginDir, 'openshock.css'));
        });

        // JS
        app.get('/openshock/openshock.js', (req, res) => {
            res.sendFile(path.join(pluginDir, 'openshock.js'));
        });

        // Overlay CSS
        app.get('/openshock/openshock_overlay.css', (req, res) => {
            res.sendFile(path.join(pluginDir, 'overlay', 'openshock_overlay.css'));
        });

        // Overlay JS
        app.get('/openshock/openshock_overlay.js', (req, res) => {
            res.sendFile(path.join(pluginDir, 'overlay', 'openshock_overlay.js'));
        });

        // ============ API ROUTES - CONFIG ============

        // Get Config
        app.get('/api/openshock/config', (req, res) => {
            res.json({
                success: true,
                config: this.config
            });
        });

        // Update Config
        app.post('/api/openshock/config', async (req, res) => {
            try {
                const newConfig = req.body;

                // Merge config
                this.config = { ...this.config, ...newConfig };

                // Save to database
                await this.saveData();

                // Update helpers
                if (this.config.apiKey) {
                    this.openShockClient.updateConfig({
                        apiKey: this.config.apiKey,
                        baseUrl: this.config.baseUrl
                    });
                }

                if (this.safetyManager) {
                    this.safetyManager.updateLimits({
                        globalLimits: this.config.globalLimits,
                        defaultCooldowns: this.config.defaultCooldowns,
                        userLimits: this.config.userLimits,
                        emergencyStop: this.config.emergencyStop
                    });
                }

                this._broadcastStatus();

                res.json({
                    success: true,
                    message: 'Configuration updated successfully',
                    config: this.config
                });

            } catch (error) {
                this.api.log(`Failed to update config: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - DEVICES ============

        // Get Devices
        app.get('/api/openshock/devices', (req, res) => {
            res.json({
                success: true,
                devices: this.devices
            });
        });

        // Refresh Devices
        app.post('/api/openshock/devices/refresh', async (req, res) => {
            try {
                await this.loadDevices();

                res.json({
                    success: true,
                    message: 'Devices refreshed successfully',
                    devices: this.devices
                });

            } catch (error) {
                this.api.log(`Failed to refresh devices: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get Single Device
        app.get('/api/openshock/devices/:id', (req, res) => {
            const device = this.devices.find(d => d.id === req.params.id);

            if (!device) {
                return res.status(404).json({
                    success: false,
                    error: 'Device not found'
                });
            }

            res.json({
                success: true,
                device: device
            });
        });

        // Test Device
        app.post('/api/openshock/test/:deviceId', async (req, res) => {
            try {
                const { deviceId } = req.params;
                const { type = 'vibrate', intensity = 30, duration = 1000 } = req.body;

                const device = this.devices.find(d => d.id === deviceId);
                if (!device) {
                    return res.status(404).json({
                        success: false,
                        error: 'Device not found'
                    });
                }

                // Safety-Check
                const safetyCheck = this.safetyManager.validateCommand({
                    deviceId,
                    type,
                    intensity,
                    duration,
                    userId: 'test-user',
                    source: 'manual-test'
                });

                if (!safetyCheck.allowed) {
                    return res.status(403).json({
                        success: false,
                        error: safetyCheck.reason
                    });
                }

                // Command senden
                await this.openShockClient.sendControl(deviceId, {
                    type,
                    intensity: safetyCheck.adjustedIntensity || intensity,
                    duration: safetyCheck.adjustedDuration || duration
                });

                // Log
                this._logCommand({
                    deviceId,
                    deviceName: device.name,
                    type,
                    intensity: safetyCheck.adjustedIntensity || intensity,
                    duration: safetyCheck.adjustedDuration || duration,
                    userId: 'test-user',
                    username: 'Manual Test',
                    source: 'manual-test',
                    success: true
                });

                this.stats.totalCommands++;
                this.stats.successfulCommands++;
                this.stats.lastCommandTime = Date.now();

                this._broadcastCommandSent({
                    device: device.name,
                    type,
                    intensity: safetyCheck.adjustedIntensity || intensity,
                    duration: safetyCheck.adjustedDuration || duration
                });

                res.json({
                    success: true,
                    message: 'Test command sent successfully'
                });

            } catch (error) {
                this.api.log(`Failed to send test command: ${error.message}`, 'error');
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - MAPPINGS ============

        // Get All Mappings
        app.get('/api/openshock/mappings', (req, res) => {
            try {
                const mappings = this.mappingEngine.getAllMappings();
                res.json({
                    success: true,
                    mappings
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create Mapping
        app.post('/api/openshock/mappings', async (req, res) => {
            try {
                const mapping = req.body;
                const id = this.mappingEngine.addMapping(mapping);

                await this.saveData();

                res.json({
                    success: true,
                    message: 'Mapping created successfully',
                    id
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update Mapping
        app.put('/api/openshock/mappings/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id);
                const mapping = req.body;

                this.mappingEngine.updateMapping(id, mapping);
                await this.saveData();

                res.json({
                    success: true,
                    message: 'Mapping updated successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete Mapping
        app.delete('/api/openshock/mappings/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id);

                this.mappingEngine.deleteMapping(id);
                await this.saveData();

                res.json({
                    success: true,
                    message: 'Mapping deleted successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Import Mappings
        app.post('/api/openshock/mappings/import', async (req, res) => {
            try {
                const { mappings } = req.body;

                if (!Array.isArray(mappings)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid mappings format'
                    });
                }

                let imported = 0;
                for (const mapping of mappings) {
                    this.mappingEngine.addMapping(mapping);
                    imported++;
                }

                await this.saveData();

                res.json({
                    success: true,
                    message: `${imported} mappings imported successfully`,
                    imported
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Export Mappings
        app.get('/api/openshock/mappings/export', (req, res) => {
            try {
                const mappings = this.mappingEngine.getAllMappings();

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="openshock-mappings-${Date.now()}.json"`);
                res.json(mappings);

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - PATTERNS ============

        // Get All Patterns
        app.get('/api/openshock/patterns', (req, res) => {
            try {
                const patterns = this.patternEngine.getAllPatterns();
                res.json({
                    success: true,
                    patterns
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Create Pattern
        app.post('/api/openshock/patterns', async (req, res) => {
            try {
                const pattern = req.body;
                const id = this.patternEngine.addPattern(pattern);

                await this.saveData();

                res.json({
                    success: true,
                    message: 'Pattern created successfully',
                    id
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update Pattern
        app.put('/api/openshock/patterns/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id);
                const pattern = req.body;

                this.patternEngine.updatePattern(id, pattern);
                await this.saveData();

                res.json({
                    success: true,
                    message: 'Pattern updated successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete Pattern
        app.delete('/api/openshock/patterns/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id);

                this.patternEngine.deletePattern(id);
                await this.saveData();

                res.json({
                    success: true,
                    message: 'Pattern deleted successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Execute Pattern
        app.post('/api/openshock/patterns/execute', async (req, res) => {
            try {
                const { patternId, deviceId, variables = {} } = req.body;

                const pattern = this.patternEngine.getPattern(patternId);
                if (!pattern) {
                    return res.status(404).json({
                        success: false,
                        error: 'Pattern not found'
                    });
                }

                const device = this.devices.find(d => d.id === deviceId);
                if (!device) {
                    return res.status(404).json({
                        success: false,
                        error: 'Device not found'
                    });
                }

                // Pattern ausführen
                const executionId = await this._executePattern(pattern, device, {
                    userId: 'manual-execution',
                    username: 'Manual',
                    source: 'manual',
                    variables
                });

                res.json({
                    success: true,
                    message: 'Pattern execution started',
                    executionId
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Stop Pattern Execution
        app.post('/api/openshock/patterns/stop/:executionId', async (req, res) => {
            try {
                const { executionId } = req.params;

                if (this.activePatternExecutions.has(executionId)) {
                    const execution = this.activePatternExecutions.get(executionId);
                    execution.cancelled = true;
                    this.activePatternExecutions.delete(executionId);

                    res.json({
                        success: true,
                        message: 'Pattern execution stopped'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Execution not found or already completed'
                    });
                }

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Import Pattern
        app.post('/api/openshock/patterns/import', async (req, res) => {
            try {
                const pattern = req.body;

                const id = this.patternEngine.addPattern(pattern);
                await this.saveData();

                res.json({
                    success: true,
                    message: 'Pattern imported successfully',
                    id
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Export Pattern
        app.get('/api/openshock/patterns/export/:id', (req, res) => {
            try {
                const id = parseInt(req.params.id);
                const pattern = this.patternEngine.getPattern(id);

                if (!pattern) {
                    return res.status(404).json({
                        success: false,
                        error: 'Pattern not found'
                    });
                }

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="pattern-${pattern.name}-${Date.now()}.json"`);
                res.json(pattern);

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - SAFETY ============

        // Get Safety Settings
        app.get('/api/openshock/safety', (req, res) => {
            try {
                const settings = this.safetyManager.getSettings();
                res.json({
                    success: true,
                    settings
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update Safety Settings
        app.post('/api/openshock/safety', async (req, res) => {
            try {
                const settings = req.body;

                this.safetyManager.updateLimits(settings);

                // Update config
                this.config.globalLimits = settings.globalLimits || this.config.globalLimits;
                this.config.defaultCooldowns = settings.defaultCooldowns || this.config.defaultCooldowns;
                this.config.userLimits = settings.userLimits || this.config.userLimits;
                this.config.emergencyStop = settings.emergencyStop || this.config.emergencyStop;

                await this.saveData();

                res.json({
                    success: true,
                    message: 'Safety settings updated successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Emergency Stop
        app.post('/api/openshock/emergency-stop', async (req, res) => {
            try {
                // Emergency Stop aktivieren
                this.safetyManager.activateEmergencyStop();
                this.config.emergencyStop.enabled = true;

                await this.saveData();

                // Queue leeren
                this.queueManager.clearQueue();

                // Alle Pattern-Executions stoppen
                this.activePatternExecutions.clear();

                // Stats
                this.stats.emergencyStops++;

                // Broadcast
                this._broadcastEmergencyStop();

                this.api.log('EMERGENCY STOP ACTIVATED', 'warn');

                res.json({
                    success: true,
                    message: 'Emergency stop activated'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Clear Emergency Stop
        app.post('/api/openshock/emergency-clear', async (req, res) => {
            try {
                // Emergency Stop deaktivieren
                this.safetyManager.deactivateEmergencyStop();
                this.config.emergencyStop.enabled = false;

                await this.saveData();

                this.api.log('Emergency stop cleared', 'info');

                this._broadcastStatus();

                res.json({
                    success: true,
                    message: 'Emergency stop cleared'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - QUEUE ============

        // Get Queue Status
        app.get('/api/openshock/queue/status', (req, res) => {
            try {
                const status = this.queueManager.getStatus();
                res.json({
                    success: true,
                    status
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Clear Queue
        app.post('/api/openshock/queue/clear', (req, res) => {
            try {
                this.queueManager.clearQueue();

                res.json({
                    success: true,
                    message: 'Queue cleared successfully'
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Remove Queue Item
        app.delete('/api/openshock/queue/:id', (req, res) => {
            try {
                const id = req.params.id;
                const removed = this.queueManager.removeItem(id);

                if (removed) {
                    res.json({
                        success: true,
                        message: 'Queue item removed'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Queue item not found'
                    });
                }

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ============ API ROUTES - STATS ============

        // Get Statistics
        app.get('/api/openshock/stats', (req, res) => {
            try {
                const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
                const queueStatus = this.queueManager.getStatus();

                res.json({
                    success: true,
                    stats: {
                        ...this.stats,
                        uptime,
                        queueSize: queueStatus.queueSize,
                        queuePending: queueStatus.pending,
                        queueProcessing: queueStatus.processing,
                        activePatternExecutions: this.activePatternExecutions.size,
                        devicesCount: this.devices.length,
                        mappingsCount: this.mappingEngine.getAllMappings().length,
                        patternsCount: this.patternEngine.getAllPatterns().length
                    }
                });

            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.log('OpenShock routes registered', 'info');
    }

    /**
     * Socket.IO Events registrieren
     */
    _registerSocketEvents() {
        // Keine eingehenden Socket-Events nötig
        // Wir senden nur broadcasts

        this.api.log('OpenShock Socket.IO events registered', 'info');
    }

    /**
     * TikTok Event-Handler registrieren
     */
    _registerTikTokEvents() {
        // Chat
        this.api.on('tiktok:chat', async (data) => {
            await this.handleTikTokEvent('chat', data);
        });

        // Gift
        this.api.on('tiktok:gift', async (data) => {
            await this.handleTikTokEvent('gift', data);
        });

        // Follow
        this.api.on('tiktok:follow', async (data) => {
            await this.handleTikTokEvent('follow', data);
        });

        // Share
        this.api.on('tiktok:share', async (data) => {
            await this.handleTikTokEvent('share', data);
        });

        // Subscribe
        this.api.on('tiktok:subscribe', async (data) => {
            await this.handleTikTokEvent('subscribe', data);
        });

        // Like
        this.api.on('tiktok:like', async (data) => {
            await this.handleTikTokEvent('like', data);
        });

        // Goal Progress
        this.api.on('tiktok:goal_progress', async (data) => {
            await this.handleTikTokEvent('goal_progress', data);
        });

        // Goal Complete
        this.api.on('tiktok:goal_complete', async (data) => {
            await this.handleTikTokEvent('goal_complete', data);
        });

        this.api.log('OpenShock TikTok event handlers registered', 'info');
    }

    /**
     * TikTok Event Handler
     */
    async handleTikTokEvent(eventType, eventData) {
        try {
            // Stats
            this.stats.tiktokEventsProcessed++;

            // Event-Log
            this._addEventLog({
                type: eventType,
                source: 'tiktok',
                data: eventData,
                timestamp: Date.now()
            });

            // Mapping-Engine fragen, welche Actions getriggert werden sollen
            const actions = this.mappingEngine.processEvent(eventType, eventData);

            if (actions.length === 0) {
                return;
            }

            // Jede Action ausführen
            for (const action of actions) {
                await this.executeAction(action, {
                    userId: eventData.userId || eventData.uniqueId || 'unknown',
                    username: eventData.username || eventData.nickname || 'Unknown',
                    source: eventType,
                    sourceData: eventData
                });
            }

        } catch (error) {
            this.api.log(`Error handling TikTok event ${eventType}: ${error.message}`, 'error');
            this._addError(`TikTok Event Error (${eventType})`, error.message);
        }
    }

    /**
     * Action ausführen
     */
    async executeAction(action, context) {
        try {
            const { userId, username, source, sourceData } = context;

            // Emergency Stop Check
            if (this.config.emergencyStop.enabled) {
                this.api.log('Action blocked: Emergency Stop is active', 'warn');
                this.stats.blockedCommands++;
                return;
            }

            // Pause Check
            if (this.isPaused) {
                this.api.log('Action blocked: Plugin is paused', 'warn');
                this.stats.blockedCommands++;
                return;
            }

            // Action-Type bestimmen
            if (action.type === 'command') {
                // Direkter Command
                await this._executeCommand(action, context);

            } else if (action.type === 'pattern') {
                // Pattern ausführen
                await this._executePatternFromAction(action, context);

            } else {
                this.api.log(`Unknown action type: ${action.type}`, 'warn');
            }

        } catch (error) {
            this.api.log(`Error executing action: ${error.message}`, 'error');
            this._addError('Action Execution Error', error.message);
        }
    }

    /**
     * Command ausführen (über Queue)
     */
    async _executeCommand(action, context) {
        const { userId, username, source, sourceData } = context;
        const { deviceId, commandType, intensity, duration } = action;

        // Device finden
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.api.log(`Device ${deviceId} not found`, 'warn');
            return;
        }

        // In Queue einfügen
        this.queueManager.addItem({
            id: `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'command',
            deviceId,
            deviceName: device.name,
            commandType,
            intensity,
            duration,
            userId,
            username,
            source,
            sourceData,
            timestamp: Date.now(),
            priority: action.priority || 5
        });

        this.stats.queuedCommands++;
    }

    /**
     * Pattern ausführen (über Queue)
     */
    async _executePatternFromAction(action, context) {
        const { userId, username, source, sourceData } = context;
        const { deviceId, patternId, variables = {} } = action;

        // Pattern laden
        const pattern = this.patternEngine.getPattern(patternId);
        if (!pattern) {
            this.api.log(`Pattern ${patternId} not found`, 'warn');
            return;
        }

        // Device finden
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            this.api.log(`Device ${deviceId} not found`, 'warn');
            return;
        }

        // Pattern ausführen
        await this._executePattern(pattern, device, {
            userId,
            username,
            source,
            sourceData,
            variables
        });
    }

    /**
     * Pattern ausführen (alle Steps in Queue)
     */
    async _executePattern(pattern, device, context) {
        const executionId = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Execution tracken
        this.activePatternExecutions.set(executionId, {
            patternId: pattern.id,
            patternName: pattern.name,
            deviceId: device.id,
            deviceName: device.name,
            startTime: Date.now(),
            cancelled: false
        });

        // Pattern-Steps generieren
        const steps = this.patternEngine.generateSteps(pattern, context.variables);

        // Alle Steps in Queue einfügen
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            this.queueManager.addItem({
                id: `${executionId}-step-${i}`,
                type: 'command',
                deviceId: device.id,
                deviceName: device.name,
                commandType: step.type,
                intensity: step.intensity,
                duration: step.duration,
                userId: context.userId,
                username: context.username,
                source: `pattern:${pattern.name}`,
                sourceData: context.sourceData,
                timestamp: Date.now() + (step.delay || 0),
                priority: 5,
                executionId,
                stepIndex: i
            });
        }

        this.stats.patternsExecuted++;

        return executionId;
    }

    /**
     * Queue-Item verarbeiten
     */
    async _processQueueItem(item) {
        try {
            // Check ob Execution gecancelt wurde
            if (item.executionId) {
                const execution = this.activePatternExecutions.get(item.executionId);
                if (execution && execution.cancelled) {
                    this.api.log(`Pattern execution ${item.executionId} was cancelled, skipping step`, 'info');
                    return true; // Als erfolgreich markieren (damit keine Retries)
                }
            }

            // Safety-Check
            const safetyCheck = this.safetyManager.validateCommand({
                deviceId: item.deviceId,
                type: item.commandType,
                intensity: item.intensity,
                duration: item.duration,
                userId: item.userId,
                source: item.source
            });

            if (!safetyCheck.allowed) {
                this.api.log(`Command blocked by safety: ${safetyCheck.reason}`, 'warn');
                this.stats.blockedCommands++;

                // Log
                this._logCommand({
                    ...item,
                    success: false,
                    errorMessage: `Blocked: ${safetyCheck.reason}`
                });

                return false;
            }

            // Command senden
            await this.openShockClient.sendControl(item.deviceId, {
                type: item.commandType,
                intensity: safetyCheck.adjustedIntensity || item.intensity,
                duration: safetyCheck.adjustedDuration || item.duration
            });

            // Log
            this._logCommand({
                deviceId: item.deviceId,
                deviceName: item.deviceName,
                type: item.commandType,
                intensity: safetyCheck.adjustedIntensity || item.intensity,
                duration: safetyCheck.adjustedDuration || item.duration,
                userId: item.userId,
                username: item.username,
                source: item.source,
                success: true
            });

            // Stats
            this.stats.totalCommands++;
            this.stats.lastCommandTime = Date.now();

            // Broadcast
            this._broadcastCommandSent({
                device: item.deviceName,
                type: item.commandType,
                intensity: safetyCheck.adjustedIntensity || item.intensity,
                duration: safetyCheck.adjustedDuration || item.duration,
                user: item.username,
                source: item.source
            });

            // Wenn Pattern-Step, checken ob letzter Step
            if (item.executionId) {
                const execution = this.activePatternExecutions.get(item.executionId);
                if (execution) {
                    // Prüfen ob alle Steps verarbeitet wurden
                    // (Wird vereinfacht - in Produktion würde man die Steps tracken)
                    // Für jetzt: Execution nach 10 Sekunden entfernen
                    setTimeout(() => {
                        this.activePatternExecutions.delete(item.executionId);
                    }, 10000);
                }
            }

            return true;

        } catch (error) {
            this.api.log(`Failed to process queue item: ${error.message}`, 'error');

            // Log
            this._logCommand({
                deviceId: item.deviceId,
                deviceName: item.deviceName,
                type: item.commandType,
                intensity: item.intensity,
                duration: item.duration,
                userId: item.userId,
                username: item.username,
                source: item.source,
                success: false,
                errorMessage: error.message
            });

            this._addError('Queue Processing Error', error.message);

            return false;
        }
    }

    /**
     * Devices von OpenShock API laden
     */
    async loadDevices() {
        try {
            if (!this.config.apiKey || this.config.apiKey.trim() === '') {
                throw new Error('API Key not configured');
            }

            this.api.log('Loading devices from OpenShock API...', 'info');

            const devices = await this.openShockClient.getDevices();
            this.devices = devices;

            this.api.log(`Loaded ${devices.length} devices`, 'info');

            // Broadcast
            this._broadcastDeviceUpdate();

            return devices;

        } catch (error) {
            this.api.log(`Failed to load devices: ${error.message}`, 'error');
            this._addError('Device Loading Error', error.message);
            throw error;
        }
    }

    /**
     * Daten laden (Config, Mappings, Patterns)
     */
    async loadData() {
        const db = this.api.getDatabase();

        // Config laden
        try {
            const configRow = db.prepare('SELECT value FROM openshock_config WHERE key = ?').get('config');
            if (configRow) {
                const savedConfig = JSON.parse(configRow.value);
                this.config = { ...this.config, ...savedConfig };
            }
        } catch (error) {
            this.api.log(`Failed to load config from database: ${error.message}`, 'warn');
        }

        this.api.log('OpenShock data loaded', 'info');
    }

    /**
     * Daten speichern (Config, Mappings, Patterns)
     */
    async saveData() {
        const db = this.api.getDatabase();

        // Config speichern
        try {
            const stmt = db.prepare('INSERT OR REPLACE INTO openshock_config (key, value) VALUES (?, ?)');
            stmt.run('config', JSON.stringify(this.config));
        } catch (error) {
            this.api.log(`Failed to save config to database: ${error.message}`, 'error');
        }

        this.api.log('OpenShock data saved', 'info');
    }

    /**
     * Command loggen
     */
    _logCommand(command) {
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare(`
                INSERT INTO openshock_command_history
                (device_id, device_name, command_type, intensity, duration, user_id, username, source, success, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                command.deviceId,
                command.deviceName,
                command.type,
                command.intensity,
                command.duration,
                command.userId,
                command.username,
                command.source,
                command.success ? 1 : 0,
                command.errorMessage || null
            );
        } catch (error) {
            this.api.log(`Failed to log command: ${error.message}`, 'error');
        }
    }

    /**
     * Event loggen
     */
    _addEventLog(event) {
        this.eventLog.push(event);

        if (this.eventLog.length > this.maxEventLog) {
            this.eventLog.shift();
        }

        // In Datenbank
        const db = this.api.getDatabase();

        try {
            const stmt = db.prepare(`
                INSERT INTO openshock_event_log
                (event_type, event_source, user_id, username, action_taken, success)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                event.type,
                event.source,
                event.data?.userId || event.data?.uniqueId || null,
                event.data?.username || event.data?.nickname || null,
                null,
                1
            );
        } catch (error) {
            this.api.log(`Failed to log event: ${error.message}`, 'error');
        }
    }

    /**
     * Error loggen
     */
    _addError(category, message) {
        const error = {
            category,
            message,
            timestamp: Date.now()
        };

        this.stats.errors.push(error);

        // Max 100 errors behalten
        if (this.stats.errors.length > 100) {
            this.stats.errors.shift();
        }
    }

    /**
     * Stats-Timer starten
     */
    _startStatsTimer() {
        // Alle 5 Sekunden Stats broadcasten
        setInterval(() => {
            this._broadcastStatsUpdate();
        }, 5000);
    }

    /**
     * Status broadcasten
     */
    _broadcastStatus() {
        this.api.emit('openshock:status', {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            emergencyStop: this.config.emergencyStop.enabled,
            devicesCount: this.devices.length,
            hasApiKey: !!(this.config.apiKey && this.config.apiKey.trim() !== '')
        });
    }

    /**
     * Device-Update broadcasten
     */
    _broadcastDeviceUpdate() {
        this.api.emit('openshock:device-update', {
            devices: this.devices
        });
    }

    /**
     * Command-Sent broadcasten
     */
    _broadcastCommandSent(data) {
        this.api.emit('openshock:command-sent', data);
    }

    /**
     * Queue-Update broadcasten
     */
    _broadcastQueueUpdate() {
        const status = this.queueManager.getStatus();
        this.api.emit('openshock:queue-update', status);
    }

    /**
     * Emergency-Stop broadcasten
     */
    _broadcastEmergencyStop() {
        this.api.emit('openshock:emergency-stop', {
            timestamp: Date.now()
        });
    }

    /**
     * Stats-Update broadcasten
     */
    _broadcastStatsUpdate() {
        const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
        const queueStatus = this.queueManager ? this.queueManager.getStatus() : {};

        this.api.emit('openshock:stats-update', {
            ...this.stats,
            uptime,
            queueSize: queueStatus.queueSize || 0,
            activePatternExecutions: this.activePatternExecutions.size
        });
    }

    /**
     * Plugin beenden
     */
    async destroy() {
        try {
            this.api.log('OpenShock Plugin shutting down...', 'info');

            // Queue stoppen
            if (this.queueManager) {
                this.queueManager.stopProcessing();
            }

            // Pattern-Executions stoppen
            this.activePatternExecutions.clear();

            // Daten speichern
            await this.saveData();

            this.isRunning = false;

            this.api.log('OpenShock Plugin shut down successfully', 'info');

        } catch (error) {
            this.api.log(`Error during shutdown: ${error.message}`, 'error');
        }
    }
}

module.exports = OpenShockPlugin;
